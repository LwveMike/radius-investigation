import Client from 'node-radius-client'
import nodeRadiusUtils from 'node-radius-utils'

const dics = nodeRadiusUtils.dictionaries.rfc2865

async function radius(
  hostname: string,
  username: string,
  password: string,
  secret: string,
) {
  const client = new Client({
    host: hostname,
    hostPort: 1812,
    secret,
    timeout: 2_000,
    retries: 1,
    dictionaries: [dics.file],
  })

  try {
    const idk = await client.accessRequest({
      secret,
      attributes: [
        [dics.attributes.USER_NAME, username],
        [dics.attributes.USER_PASSWORD, password],
      ],
    })

    console.log(idk)

    return idk
  }
  catch (err: unknown) {
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
