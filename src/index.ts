import { Buffer } from 'node:buffer'
import nodeRadiusUtils from 'node-radius-utils'
import { Client, RetryableError } from './client'
import { logger } from './logger'

const dics = nodeRadiusUtils.dictionaries.rfc2865
const freeRadius = nodeRadiusUtils.dictionaries.freeradius

async function radius(
  username: string,
  password: string,
) {
  const client = Client.create({
    host: 'localhost',
    hostPort: 1812,
    secret: 'testing123',
    timeout: 3_000,
    retries: 2,
    dictionaries: [
      dics.file,
      freeRadius.file,
    ],
  })

  try {
    const idk = await client.accessRequestMessage([
      [dics.attributes.USER_NAME, username],
      // [dics.attributes.USER_PASSWORD, password],
      [dics.attributes.CHAP_PASSWORD, Buffer.from(password)],
    ])

    return idk
  }
  catch (err: unknown) {
    if (err instanceof RetryableError) {
      return logger.log(err.message)
    }

    console.error(err)
  }
};

const ACCOUNTS = {
  user: {
    username: 'nfa-user',
    password: 'Trewq54321',
  },
  admin: {
    username: 'nfa-admin',
    password: 'Trewq54321',
  },
  disabled: {
    username: 'disabled-user',
    password: 'Trewq54321',
  },
  expired: {
    username: 'expired-user',
    password: 'Trewq54321',
  },
  chap: {
    username: 'nfa-chap',
    password: 'Trewq54321',
  },
}

async function main() {
  console.log('================================')
  console.log()
  for (const account of Object.entries(ACCOUNTS)) {
    const [name, accountData] = account
    logger.log(`Authenticating ${name}...`)
    await radius(accountData.username, accountData.password)
    console.log()
  }
  console.log('================================')
}

main()
