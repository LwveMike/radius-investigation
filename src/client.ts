import type { Buffer } from 'node:buffer'
import type { EncodeArgs } from 'radius'
import dgram from 'node:dgram'
import { dictionaries } from 'node-radius-utils'
import radius from 'radius'
import { z } from 'zod'
import { logger } from './logger'

type SendArgs = Pick<EncodeArgs, 'code' | 'attributes'>

interface TrySendReturn {
  code: string
  identifier: number
  attributes: any
}

export class RetryableError extends Error {
  public retryable: boolean

  constructor(retryable: boolean, message: string) {
    super(message)
    this.retryable = retryable
  }
}

function getEphemeralPort() {
  const begin = 49152
  const end = 65535

  return Math.floor(Math.random() * (end - begin + 1) + begin)
}

// const rfc2865 = dictionaries.rfc2865

const optionsSchema = z.object({
  host: z.string().trim(),
  hostPort: z.number().min(0).optional().default(1812),
  localPort: z.number().min(0).optional(),
  timeout: z.number().min(0).optional().default(2_500),
  retries: z.number().min(0).optional().default(3),
  dictionaries: z.array(z.string().trim().optional()),
  secret: z.string(),
})

type Options = z.infer<typeof optionsSchema>

export class Client {
  public options: Partial<Options>

  /**
   * @throws {Error} if not valid options
   */
  static create(options: unknown) {
    const result = optionsSchema.safeParse(options)

    if (!result.success) {
      throw new Error(result.error.message)
    }

    return new this(result.data)
  }

  private constructor(options: Options) {
    this.options = options

    if (this.options.dictionaries) {
      this.options.dictionaries
        .filter(v => v !== undefined)
        .forEach((dictionary) => {
          radius.add_dictionary(dictionary)
        })
    }
  }

  public async accessRequestMessage(attributes: SendArgs['attributes']) {
    const freeRadiusPacketType = dictionaries.freeradius_internal.values.PACKET_TYPE

    if (freeRadiusPacketType === undefined) {
      throw new Error('TODO: No packet type for ACCESS_REQUEST')
    }

    const response = await this.send({
      code: freeRadiusPacketType.ACCESS_REQUEST,
      attributes,
    })

    if (response.code === freeRadiusPacketType.ACCESS_ACCEPT) {
      console.log(response)
      console.log(response.attributes.State)
      return logger.log('Authentication successful | ACCESS_ACCEPT')
    }

    if (response.code === freeRadiusPacketType.ACCESS_REJECT) {
      console.log(response)
      console.log(response.attributes.State)
      return logger.log('Authentication not successful | ACCESS_REJECT')
    }

    if (response.code === freeRadiusPacketType.PASSWORD_REJECT) {
      console.log(response.attributes.State)
      return logger.log('Authentication not successful | PASSWORD_REJECT')
    }

    if (response.code === freeRadiusPacketType.PASSWORD_EXPIRED) {
      console.log(response.attributes.State)
      return logger.log('Authentication not successful | PASSWORD_EXPIRED')
    }

    const msg = 'Should not get here'
    logger.log(msg)
    console.log(response)
    throw new Error(msg)

    // if (response.code === freeRadiusPacketType.ACCESS_REJECT) {
    //   const replyMessageAttr = rfc2865.attributes.REPLY_MESSAGE

    //   if (replyMessageAttr === undefined) {
    //     throw new Error('TODO: No reply message attribute for ACCESS_REJECT')
    //   }

    //   const error = new Error(response.attributes[replyMessageAttr])

    //   throw error
    // }
  }

  public async send({ attributes, code }: SendArgs) {
    const encodedPacket = radius.encode({
      code,
      attributes,
      secret: this.options.secret!,
      add_message_authenticator: true,
    })

    try {
      const response = await this.trySend(encodedPacket)

      return response
    }
    catch (err: unknown) {
      if (!(err instanceof Error)) {
        const error = new Error(`not an error: ${err}`)

        throw error
      }

      throw err
    }
  }

  public trySend(encodedPacket: Buffer): Promise<TrySendReturn> {
    return new Promise((resolve, reject) => {
      const {
        host,
        hostPort,
      } = this.options

      const localPort = this.options.localPort ?? getEphemeralPort()

      const signal = AbortSignal.timeout(this.options.timeout!)

      const socket = dgram.createSocket({
        type: 'udp4',
        signal,
      })

      signal.onabort = () => {
        const error = new RetryableError(true, `Timed out after ${this.options.timeout}ms`)
        reject(error)
      }

      socket.on('error', (err) => {
        logger.log('socket errored')

        reject(err)
      })

      socket.on('close', () => {
        logger.log('socket closed')
      })
      socket.on('listening', () => {
        logger.log('socket listening')

        socket.send(encodedPacket, 0, encodedPacket.length, hostPort, host, (err) => {
          if (err)
            reject(err)
        })
      })

      socket.on('message', (packet) => {
        socket.close(() => {
          logger.log('socket close callback')
        })

        try {
          const response = radius.decode({
            packet,
            secret: this.options.secret!,
          })

          const isValid = radius.verify_response({
            response: packet,
            request: encodedPacket,
            secret: this.options.secret!,
          })

          if (!isValid) {
            return reject(new Error('Invalid RADIUS response'))
          }

          const {
            code,
            identifier,
            attributes,
          } = response

          resolve({
            code,
            identifier,
            attributes,
          })
        }
        catch (err: unknown) {
          if (err instanceof Error) {
            return reject(err)
          }

          const msg = `not an error: ${err}`
          logger.log(msg)
          return reject(new Error(msg))
        }
      })

      socket.bind(localPort)
    })
  }
}
