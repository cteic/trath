import path from 'node:path';

const KEBAB_CASE_FILENAME = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/;

/** @type {import('eslint').Rule.RuleModule} */
export const kebabCaseFilename = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require kebab-case file names',
    },
    messages: {
      notKebabCase: 'File name "{{name}}" is not kebab-case.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const name = path.basename(context.physicalFilename);
        if (!KEBAB_CASE_FILENAME.test(name)) {
          context.report({ node, messageId: 'notKebabCase', data: { name } });
        }
      },
    };
  },
};
