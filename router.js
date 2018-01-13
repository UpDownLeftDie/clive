const Koa = require('koa');
const app = new Koa();

module.exports = function initApi(PORT) {
  // response
  app.use(ctx => {
    ctx.body = 'Hello Koa';
  });

  app.listen(PORT);
};
