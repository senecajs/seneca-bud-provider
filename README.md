![Seneca Bud-Provider](http://senecajs.org/files/assets/seneca-logo.png)

> _Seneca Bud-Provider_ is a plugin for [Seneca](http://senecajs.org)

Provides access to the Bud CMS API using the Seneca _provider_
convention. Bud CMS API entities are represented as Seneca entities so
that they can be accessed using the Seneca entity API and messages.

See [seneca-entity](senecajs/seneca-entity) and the [Seneca Data
Entities
Tutorial](https://senecajs.org/docs/tutorials/understanding-data-entities.html) for more details on the Seneca entity API.

<!-- [![npm version](https://img.shields.io/npm/v/@seneca/tangocard-provider.svg)](https://npmjs.com/package/@seneca/tangocard-provider)
[![build](https://github.com/senecajs/seneca-tangocard-provider/actions/workflows/build.yml/badge.svg)](https://github.com/senecajs/seneca-tangocard-provider/actions/workflows/build.yml)
[![Coverage Status](https://coveralls.io/repos/github/senecajs/seneca-tangocard-provider/badge.svg?branch=main)](https://coveralls.io/github/senecajs/seneca-tangocard-provider?branch=main)
[![Known Vulnerabilities](https://snyk.io/test/github/senecajs/seneca-tangocard-provider/badge.svg)](https://snyk.io/test/github/senecajs/seneca-tangocard-provider)
[![DeepScan grade](https://deepscan.io/api/teams/5016/projects/19462/branches/505954/badge/grade.svg)](https://deepscan.io/dashboard#view=project&tid=5016&pid=19462&bid=505954)
[![Maintainability](https://api.codeclimate.com/v1/badges/f76e83896b731bb5d609/maintainability)](https://codeclimate.com/github/senecajs/seneca-tangocard-provider/maintainability) -->

| ![Voxgig](https://www.voxgig.com/res/img/vgt01r.png) | This open source module is sponsored and supported by [Voxgig](https://www.voxgig.com). |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |

## Quick Example

<!-- ```js
// Setup - get the key value (<SECRET>) separately from a vault or
// environment variable.
Seneca()
  // Get API keys using the seneca-env plugin
  .use('env', {
    var: {
      $TANGOCARD_APIKEY: String,
      $TANGOCARD_USERTOKEN: String,
    },
  })
  .use('provider', {
    provider: {
      tangocard: {
        keys: {
          apikey: { value: '$TANGOCARD_APIKEY' },
          usertoken: { value: '$TANGOCARD_USERTOKEN' },
        },
      },
    },
  })
  .use('tangocard-provider')

let board = await seneca
  .entity('provider/tangocard/board')
  .load$('<tangocard-board-id>')

Console.log('BOARD', board)

board.desc = 'New description'
board = await board.save$()

Console.log('UPDATED BOARD', board)
``` -->

## Install

```sh
$ npm install @seneca/bud-provider @seneca/env
```

## How to get access


<!--START:options-->


## Options

* `url` : string
* `fetch` : any
* `debug` : boolean
* `retry` : object
* `entity` : object
* `wait` : object
* `limit` : object
* `store` : object
* `init$` : boolean


<!--END:options-->

<!--START:action-list-->


## Action Patterns

* ["sys":"entity","base":"bud","cmd":"list","name":"account","zone":"provider"](#-sysentitybasebudcmdlistnameaccountzoneprovider-)
* ["sys":"entity","base":"bud","cmd":"list","name":"obp","zone":"provider"](#-sysentitybasebudcmdlistnameobpzoneprovider-)
* ["sys":"entity","base":"bud","cmd":"list","name":"transaction","zone":"provider"](#-sysentitybasebudcmdlistnametransactionzoneprovider-)
* ["sys":"entity","base":"bud","cmd":"load","name":"account","zone":"provider"](#-sysentitybasebudcmdloadnameaccountzoneprovider-)
* ["sys":"entity","base":"bud","cmd":"load","name":"connection","zone":"provider"](#-sysentitybasebudcmdloadnameconnectionzoneprovider-)
* ["sys":"entity","base":"bud","cmd":"load","name":"customer","zone":"provider"](#-sysentitybasebudcmdloadnamecustomerzoneprovider-)
* ["sys":"entity","base":"bud","cmd":"save","name":"customer","zone":"provider"](#-sysentitybasebudcmdsavenamecustomerzoneprovider-)
* ["sys":"provider","get":"info","provider":"bud"](#-sysprovidergetinfoproviderbud-)


<!--END:action-list-->

<!--START:action-desc-->


## Action Descriptions

### &laquo; `"sys":"entity","base":"bud","cmd":"list","name":"account","zone":"provider"` &raquo;

No description provided.



----------
### &laquo; `"sys":"entity","base":"bud","cmd":"list","name":"obp","zone":"provider"` &raquo;

No description provided.



----------
### &laquo; `"sys":"entity","base":"bud","cmd":"list","name":"transaction","zone":"provider"` &raquo;

No description provided.



----------
### &laquo; `"sys":"entity","base":"bud","cmd":"load","name":"account","zone":"provider"` &raquo;

No description provided.



----------
### &laquo; `"sys":"entity","base":"bud","cmd":"load","name":"connection","zone":"provider"` &raquo;

No description provided.



----------
### &laquo; `"sys":"entity","base":"bud","cmd":"load","name":"customer","zone":"provider"` &raquo;

No description provided.



----------
### &laquo; `"sys":"entity","base":"bud","cmd":"save","name":"customer","zone":"provider"` &raquo;

No description provided.



----------
### &laquo; `"sys":"provider","get":"info","provider":"bud"` &raquo;

Get information about the Bud SDK.



----------


<!--END:action-desc-->

## More Examples

## Motivation

## Support

## API

## Contributing

## Background
