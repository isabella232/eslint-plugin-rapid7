// external dependencies
const astUtils = require('eslint/lib/ast-utils');
const naturalCompare = require('natural-compare');

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Gets the property name of the given `Property` node.
 *
 * - If the property's key is an `Identifier` node, this returns the key's name
 *   whether it's a computed property or not.
 * - If the property has a static name, this returns the static name.
 * - Otherwise, this returns null.
 *
 * @param {ASTNode} node - The `Property` node to get.
 * @returns {string|null} The property name or null.
 * @private
 */
function getPropertyName(node) {
  return astUtils.getStaticPropertyName(node) || node.key.name || null;
}

/**
 * Functions which check that the given 2 names are in specific order.
 *
 * Postfix `I` is meant insensitive.
 * Postfix `N` is meant natual.
 *
 * @private
 */
const sorters = {
  asc(a, b) {
    if (a < b) {
      return -1;
    } else if (a > b) {
      return 1;
    }

    return 0;
  },
  ascI(a, b) {
    return sorters.asc(typeof a === 'string' ? a.toLowerCase() : a, typeof b === 'string' ? b.toLowerCase() : b);
  },
  ascIN(a, b) {
    return naturalCompare(typeof a === 'string' ? a.toLowerCase() : a, typeof b === 'string' ? b.toLowerCase() : b);
  },
  ascN(a, b) {
    return naturalCompare(a, b);
  },
  desc(a, b) {
    return sorters.asc(b, a);
  },
  descI(a, b) {
    return sorters.ascI(b, a);
  },
  descIN(a, b) {
    return sorters.ascIN(b, a);
  },
  descN(a, b) {
    return sorters.ascN(b, a);
  },
};

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
  create(context) {
    // Parse options.
    const order = context.options[0] || 'asc';
    const options = context.options[1];
    const insensitive = (options && options.caseSensitive) === false;
    const natual = Boolean(options && options.natural);
    const sorter = sorters[order + (insensitive ? 'I' : '') + (natual ? 'N' : '')];
    const sourceCode = context.getSourceCode();

    // The stack to save the previous property's name for each object literals.
    let stack = null;

    return {
      ObjectExpression() {
        stack = {
          prevName: null,
          upper: stack,
        };
      },

      'ObjectExpression:exit'() {
        stack = stack.upper;
      },

      Property(node) {
        if (node.parent.type === 'ObjectPattern') {
          return;
        }

        const prevName = stack.prevName;
        const thisName = getPropertyName(node);

        stack.prevName = thisName || prevName;

        if (!prevName || !thisName) {
          return;
        }

        const propertyListIncludesSpreadProperty = node.parent.properties.some(
          property => property.type === 'ExperimentalSpreadProperty'
        );

        if (propertyListIncludesSpreadProperty) {
          return;
        }

        if (sorter(prevName, thisName) > 0) {
          context.report({
            data: {
              insensitive: insensitive ? 'insensitive ' : '',
              natual: natual ? 'natural ' : '',
              order,
              prevName,
              thisName,
            },
            fix(fixer) {
              const propertyListIncludesComments = node.parent.properties.some(
                property => property.leadingComments || property.trailingComments
              );

              if (propertyListIncludesComments) {
                return null;
              }

              const rangeStart = node.parent.properties[0].range[0];
              const rangeEnd = node.parent.properties[node.parent.properties.length - 1].range[1];

              const newPropertiesText = node.parent.properties
                .map(property => {
                  let name;

                  if (property.key.type === 'Literal') {
                    name = property.key.value;
                  } else if (property.key.type === 'Identifier') {
                    name = property.key.name;
                  }

                  return {
                    name,
                    nodeText: sourceCode.getText().slice(property.range[0], property.range[1]),
                  };
                })
                .sort((property0, property1) => sorter(property0.name, property1.name))
                .map(property0 => property0.nodeText)
                .join(',\n');

              return fixer.replaceTextRange([rangeStart, rangeEnd], newPropertiesText);
            },
            loc: node.key.loc,
            message:
              "Expected object keys to be in {{natual}}{{insensitive}}{{order}}ending order. '{{thisName}}' should be before '{{prevName}}'.",
            node,
          });
        }
      },
    };
  },
  meta: {
    docs: {
      category: 'Stylistic Issues',
      description: 'require object keys to be sorted',
      recommended: false,
    },
    fixable: 'code',
    schema: [
      {enum: ['asc', 'desc']},
      {
        additionalProperties: false,
        properties: {
          caseSensitive: {type: 'boolean'},
          natural: {type: 'boolean'},
        },
        type: 'object',
      },
    ],
  },
};
