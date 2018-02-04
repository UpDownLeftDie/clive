'use strict';
const { makeExecutableSchema } = require('graphql-tools');
const camelCase = require('camelcase');

module.exports = function initApi(config) {
  return makeExecutableSchema({
    typeDefs: buildTypeDefs(config),
    resolvers: buildResolvers(config),
  });
};

function buildTypeDefs(config) {
  const schemaString = convertConfig(config);

  // Construct a schema, using GraphQL schema language
  const typeDefs = `
  type Setting {
    ${schemaString}
  }
  
  type Query {
    settings: [Setting]
  }
`;

  return typeDefs;
}

function buildResolvers(config) {
  const resolvers = {
    Query: {
      settings: () => config,
    },
  };
  return resolvers;
}

function convertConfig(config) {
  const ignoredSettigs = [
    'NODE_ENV',
    'LOG_LEVEL',
    'LOG_FILE',
    'DB_FILE',
    'API',
    'API_PORT',
  ];
  let str = '';
  for (const [key, value] of Object.entries(config)) {
    if (ignoredSettigs.indexOf(key) < 0) {
      str += `${camelCase(key)}: ${determineType(value)}, `;
    }
  }

  str = str.slice(0, str.length - 2);
  return str;
}

function determineType(value) {
  if (typeof value === 'object') {
    return '[String]';
  } else if (typeof value === 'boolean') {
    return 'Boolean';
  } else if (!isNaN(value)) {
    return 'Int';
  } else {
    return 'String';
  }
}
