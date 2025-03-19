import nodeRadiusUtils from 'node-radius-utils'
import { Client, RetryableError } from './client'
import { logger } from './logger'

const dics = nodeRadiusUtils.dictionaries.rfc2865

async function radius(
  hostname: string,
  username: string,
  password: string,
  secret: string,
) {
  const client = Client.create({
    host: hostname,
    hostPort: 1812,
    secret,
    timeout: 1_000,
    retries: 2,
    dictionaries: [dics.file],
  })

  try {
    const idk = await client.accessRequest({
      [dics.attributes.USER_NAME!]: username,
      [dics.attributes.USER_PASSWORD!]: password,
    })

    console.log(idk)

    return idk
  }
  catch (err: unknown) {
    if (err instanceof RetryableError) {
      return logger.log(err.message)
    }

    console.error(err)
  }
};

async function main() {
  await radius(
    'localhost',
    'nfa-user',
    'Trewq54321',
    'testing123',
  )
}

main()
