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

    const list = await seneca.entity('provider/bud/account').list$({
      customerid: 'b75fb418-173b-4509-aafa-29a33bf8bd33',
      customersecret: 'c02893aa205e04ac32346eaaa143e385a26f6ca3d2e3e5bf11c7dcd95c8be7b6',
    })
    console.dir(list,{depth:null})
  })
