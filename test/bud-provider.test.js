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


  test('txdown', async () => {
    if (null == Config) return;

    const seneca = await makeSeneca()

    const setToken = seneca.export('BudProvider/setToken')
    
    const keymap = (await seneca.post('sys:provider,get:keymap,provider:bud')).keymap

    const tq = {
      customerid: keymap.test_custid.value,
      customersecret: keymap.test_custsecret.value,
      page_size: 200,
      account_id:  keymap.test_account.value,
    }

    console.log(tq)
    
    let list = await seneca.entity("provider/bud/transaction").list$(tq)
    console.log('FIRST', list.length, tq)
    // expect(list.length > 0).toBeTruthy()

    list = await seneca.entity("provider/bud/transaction").list$(tq)
    console.log('SECOND', list.length)


    await new Promise((r)=>{
      seneca.make("provider/bud/transaction").list$(tq, function(err, out) {
        console.log('RES0', err, list?.length)

        setToken('access','force-fail')
        
        setTimeout(()=>{
          this.make("provider/bud/transaction").list$(tq, function(err, out) {
            console.log('RES1', err, list?.length)

            setTimeout(()=>{
              this.make("provider/bud/transaction").list$(tq, function(err, out) {
                console.log('RES2', err, list?.length)
                r()
              })
            },111)
          })
        },111)
      })
    })
  }, 11111)

  
  
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

            // NOT USED IN PRODUCTION
            BUD_TEST_CUSTID: String,
            BUD_TEST_CUSTSECRET: String,
            BUD_TEST_ACCOUNT: String,
          },
        })
        .use('provider', {
          provider: {
            bud: {
              keys: {
                clientid: { value: '$BUD_CLIENTID' },
                clientsecret: { value: '$BUD_CLIENTSECRET' },

                // NOT USED IN PRODUCTION
                test_custid: { value: '$BUD_TEST_CUSTID' },
                test_custsecret: { value: '$BUD_TEST_CUSTSECRET' },
                test_account: { value: '$BUD_TEST_ACCOUNT' },
              },
            },
          },
        })
        .use(BudProvider,{
          // debug: true,
          url: 'https://api-sandbox.thisisbud.com/',
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
