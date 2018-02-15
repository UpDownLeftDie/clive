'use strict';
const { makeExecutableSchema } = require('graphql-tools');
const camelcaseKeys = require('camelcase-keys');
const _ = require('lodash');
const { loadConfig } = require('./utils');

module.exports = function initApi() {
  const camelCaseConfig = camelcaseKeys(loadConfig());
  return makeExecutableSchema({
    typeDefs: buildTypeDefs(camelCaseConfig),
    resolvers: buildResolvers(),
  });
};

function buildTypeDefs(config) {
  const schemaString = _generateSchemaString(config);
  // Construct a schema, using GraphQL schema language
  const typeDefs = `
	type Query {
    settings: Setting
  }

	type Mutation {
		updateSettings(
			${schemaString}
		): Setting
	}

  type Setting {
    ${schemaString}
  }
`;

  return typeDefs;
}

function buildResolvers() {
  const resolvers = {
    Query: {
      settings() {
        return camelcaseKeys(loadConfig());
      },
    },
    Mutation: {
      updateSettings,
    },
  };
  return resolvers;
}

function updateSettings(context, args) {
  for (const [key, value] of Object.entries(args)) {
    const envSetting = _.snakeCase(key).toUpperCase();
    process.env[envSetting] = value;
  }

  return camelcaseKeys(loadConfig());
}

function _generateSchemaString(config) {
  const ignoredSettigs = [
    'nodeEnv',
    'logLevel',
    'logFile',
    'dbFile',
    'api',
    'apiPort',
    'twitchClientId',
  ];
  let str = '';
  for (const [key, value] of Object.entries(config)) {
    if (ignoredSettigs.indexOf(key) < 0) {
      str += `${key}: ${_determineType(value)}\n`;
    }
  }
  return str;
}

function _determineType(value) {
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
