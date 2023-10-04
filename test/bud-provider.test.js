/* Copyright © 2022-2023 Seneca Project Contributors, MIT License. */

const Fs = require('fs')

const Seneca = require('seneca')
const SenecaMsgTest = require('seneca-msg-test')
const { Maintain } = require('@seneca/maintain')

const BudProvider = require('../dist/bud-provider')
const BudProviderDoc = require('../dist/BudProvider-doc')

const BasicMessages = require('./basic.messages.js')

// Only run some tests locally (not on Github Actions).
let Config = undefined
if (Fs.existsSync(__dirname + '/local-config.js')) {
  Config = require('./local-config')
}

describe('bud-provider', () => {
  test('happy', async () => {
    expect(BudProvider).toBeDefined()
    expect(BudProviderDoc).toBeDefined()

    const seneca = await makeSeneca()

    expect(
      await seneca.post('sys:provider,provider:bud,get:info')
    ).toMatchObject({
      ok: true,
      name: 'bud',
    })
  })

  test('messages', async () => {
    const seneca = await makeSeneca()
    await SenecaMsgTest(seneca, BasicMessages)()
  })

  
  test('obp-list', async () => {
    if (null == Config) return;

    const seneca = await makeSeneca()
    const list = await seneca.entity("provider/bud/obp").list$()

    // console.log(list)

    expect(list.length > 0).toBeTruthy()
  })

  
  test('maintain', async () => {
    await Maintain()
  })
})

async function makeSeneca() {
  const seneca =Seneca({ legacy: false })
        .test()
        .use('promisify')
        .use('entity')
        .use('user')
        .use('env', {
          // debug: true,
          file: [__dirname + '/local-env.js;?'],
          var: {
            BUD_CLIENTID: String,
            $BUD_CLIENTSECRET: String,
          },
        })
        .use('provider', {
          provider: {
            bud: {
              keys: {
                clientid: { value: '$BUD_CLIENTID' },
                clientsecret: { value: '$BUD_CLIENTSECRET' },
              },
            },
          },
        })
        .use(BudProvider,{
          entity: {
            customer: {
              save: {
                host_secret: false
              }
            }
          }
        })

  return seneca.ready()
}
