![Seneca](http://senecajs.org/files/assets/seneca-logo.png)
> A [Seneca.js](http://senecajs.org) plugin

# @seneca/bud-provider

[![npm version](https://img.shields.io/npm/v/@seneca/bud-provider.svg)](https://npmjs.com/package/@seneca/bud-provider)
[![build](https://github.com/senecajs/seneca-bud-provider/actions/workflows/build.yml/badge.svg)](https://github.com/senecajs/seneca-bud-provider/actions/workflows/build.yml)
[![Known Vulnerabilities](https://snyk.io/test/github/senecajs/seneca-bud-provider/badge.svg)](https://snyk.io/test/github/senecajs/seneca-bud-provider)

| ![Voxgig](https://www.voxgig.com/res/img/vgt01r.png) | This open source module is sponsored and supported by [Voxgig](https://www.voxgig.com). |
|---|---|

## Install

```sh
$ npm install @seneca/bud-provider @seneca/env
```

## Quick Example

```js
require('seneca')()
  .use('@seneca/bud-provider')
```

## More Examples

See [test/](test/) for more usage examples.

## Motivation

A [Seneca.js](http://senecajs.org) plugin.

## Support

If you're using this module and need help, you can:

- Post a [github issue](https://github.com/senecajs/seneca-bud-provider/issues)
- Tweet to [@senecajs](http://twitter.com/senecajs)
- Ask on the [Gitter](https://gitter.im/senecajs/seneca)

## API

### Options

* `url` : string
* `fetch` : any
* `debug` : boolean
* `retry` : object
* `entity` : object
* `wait` : object
* `limit` : object
* `init$` : boolean

### Action Patterns

* ["sys":"entity","base":"bud","cmd":"list","name":"account","zone":"provider"](#-sysentitybasebudcmdlistnameaccountzoneprovider-)
* ["sys":"entity","base":"bud","cmd":"list","name":"obp","zone":"provider"](#-sysentitybasebudcmdlistnameobpzoneprovider-)
* ["sys":"entity","base":"bud","cmd":"list","name":"transaction","zone":"provider"](#-sysentitybasebudcmdlistnametransactionzoneprovider-)
* ["sys":"entity","base":"bud","cmd":"load","name":"account","zone":"provider"](#-sysentitybasebudcmdloadnameaccountzoneprovider-)
* ["sys":"entity","base":"bud","cmd":"load","name":"connection","zone":"provider"](#-sysentitybasebudcmdloadnameconnectionzoneprovider-)
* ["sys":"entity","base":"bud","cmd":"load","name":"customer","zone":"provider"](#-sysentitybasebudcmdloadnamecustomerzoneprovider-)
* ["sys":"entity","base":"bud","cmd":"save","name":"customer","zone":"provider"](#-sysentitybasebudcmdsavenamecustomerzoneprovider-)
* ["sys":"provider","get":"info","provider":"bud"](#-sysprovidergetinfoproviderbud-)

### Action Descriptions

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

## Contributing

The [Senecajs org](https://github.com/senecajs/) encourages open participation. If you feel you can help in any way, be it with documentation, examples, extra testing, or new features please get in touch.

### Running tests

```sh
npm run test
```

## Background

Part of the [Senecajs org](https://github.com/senecajs/).
