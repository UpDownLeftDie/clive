const Koa = require('koa');
const koaBody = require('koa-bodyparser');
const { graphqlKoa, graphiqlKoa } = require('apollo-server-koa');
const app = new Koa();
const router = require('koa-router')();

module.exports = function initApi(PORT) {
  // route definitions
  app.use(koaBody());

  router
    // .post('/graphql', graphqlKoa({ schema: myGraphQLSchema }))
    // .get('/graphql', graphqlKoa({ schema: myGraphQLSchema }))
    .get(
      '/graphiql',
      graphiqlKoa({
        endpointURL: '/graphql',
      }),
    );

  app.use(router.routes());
  app.use(router.allowedMethods());
  app.listen(PORT);
};
