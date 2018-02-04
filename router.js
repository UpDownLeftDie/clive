'use strict';
const Koa = require('koa');
const koaBody = require('koa-bodyparser');
const { graphqlKoa, graphiqlKoa } = require('apollo-server-koa');
const app = new Koa();
const router = require('koa-router')();

module.exports = function initApi(PORT, schema) {
  // route definitions
  app.use(koaBody());

  router
    .post('/graphql', graphqlKoa({ schema }))
    .get('/graphql', graphqlKoa({ schema }))
    .get(
      '/',
      graphiqlKoa({
        endpointURL: '/graphql',
      }),
    );

  app.use(router.routes());
  app.use(router.allowedMethods());
  app.listen(PORT);
};
