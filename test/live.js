const Seneca = require('seneca')

Seneca({ legacy: false })
  .test()
  .use('promisify')
  .use('entity')
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
  .use('../')
  .ready(async function () {
    const seneca = this

    console.log(await seneca.post('sys:provider,provider:bud,get:info'))

    // const list = await seneca.entity('provider/bud/bank').list$()
    // console.log(list.slice(0, 3))
  })
