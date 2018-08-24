const Metalsmith = require('metalsmith');
const multimatch = require('multimatch');
const path = require('path');
const nunjucks = require('nunjucks');
const ignoreFrontMatter = require('./metalsmith/ignoreFrontMatter');
const NodeLoader = require('./metalsmith/nodeLoader');
const lexer = require('nunjucks/src/lexer');

function getLayouts(files, pattern, defaultLayout) {
  return multimatch(Object.keys(files), pattern).reduce((acc, file) => {
    const fileObject = files[ file ];
    const layoutName = fileObject.layoutName || path.parse(file).name;
    acc[ layoutName ] = { fileName: file, file: files[ file ] };
    if (defaultLayout === layoutName && defaultLayout !== 'default-layout') {
      acc[ 'default-layout' ] = acc[ layoutName ];
    }
    return acc;
  }, {});
}

function getPages(files, pattern, blacklistPattern) {
  // Grab blacklisted items from pattern
  const blacklist = multimatch(Object.keys(files), blacklistPattern);
  // create new filtered map of files to render twig templates from.
  return multimatch(Object.keys(files), pattern).reduce((acc, file) => {
    if (blacklist.indexOf(file) === -1) {
      acc[ file ] = files[ file ];
    }
    return acc;
  }, {});
}

function validateLayouts(layouts, { defaultLayout, staticLayout }) {
  if (!layouts[ defaultLayout ] && defaultLayout !== 'default-layout' && defaultLayout !== 'none') {
    throw new Error(`Configuration error: layout with the name ${defaultLayout} does not exist`);
  }
  if (!layouts[ staticLayout ] && staticLayout !== 'static-layout') {
    throw new Error(`Configuration error: layout with the name ${defaultLayout} does not exist`);
  }
}

function editFileName(files, oldName, newName) {
  files[ newName ] = files[ oldName ];
  files[ oldName ] = null;
  delete files[ oldName ];
  return files;
}

function editFileContents(file, newContents) {
  file.contents = newContents;
  return file;
}

function renderFile({ engine, fileName, fileString, context }) {
  return engine.renderString(fileString, context, { path: path.dirname(fileName) });
}

function twigTemplateContainsBlock(str, blockName) {
  const tokens = lexer.lex(str, { trimBlocks: true });

  // Finds {% block `blockName` %}
  while (!tokens.isFinished()) {
    let next = tokens.nextToken();
    if (next.type === 'block-start') {
      next = tokens.nextToken();
      if (next.type === 'whitespace') {
        next = tokens.nextToken();
      }
      if (next.type === 'symbol' && next.value === 'block') {
        next = tokens.nextToken();
        if (next.type === 'whitespace') {
          next = tokens.nextToken();
        }
        if (next.type === 'symbol' && next.value === blockName) {
          return true;
        }
      }
    }
  }
  return false;
}

function renderStaticFile({ engine, staticFileName, staticFileString, fileName, fileString, context }) {
  return engine.renderString(staticFileString, {
    context,
    contents: engine.renderString(
      fileString,
      context,
      { path: path.dirname(fileName) },
    ),
  }, { path: path.dirname(staticFileName) });
}

function renderTemplate({ engine, file, fileName, layouts, defaultLayout, staticLayout, context }) {
  if (file.static) {
    return renderStaticFile({
      engine,
      staticFileName: layouts[ staticLayout ].fileName,
      staticFileString: ignoreFrontMatter(layouts[ staticLayout ].file.contents.toString()),
      fileName,
      fileString: ignoreFrontMatter(file.contents.toString()),
      context,
    });
  }

  const fileString = addLayoutToFile(file, layouts, defaultLayout, staticLayout);

  return renderFile({
    engine,
    fileName,
    fileString,
    context,
  });
}

function addLayoutToFile(file, layouts, defaultLayout) {
  if (file.layout === 'none') {
    return ignoreFrontMatter(file.contents.toString());
  }
  if (file.layout && layouts[ file.layout ]) {
    const layout = layouts[ file.layout ];

    return `{% extends '${layout.fileName}' %} \n ${ignoreFrontMatter(file.contents.toString())}`;
  }

  if (defaultLayout === 'none') {
    return ignoreFrontMatter(file.contents.toString());
  }

  if (twigTemplateContainsBlock(file.contents.toString(), 'body')) {
    return `{% extends '${layouts[ defaultLayout ].fileName}' %} \n ${ignoreFrontMatter(file.contents.toString())}`;
  }

  return `{% extends '${layouts[ defaultLayout ].fileName}' %}
{% block body %}   
   ${ignoreFrontMatter(file.contents.toString())}
{% endblock %}
`;
}

function addCustomFilters(env, filters) {
  for (const name in filters || {}) {
    if ({}.hasOwnProperty.call(filters, name)) {
      let filter = null;
      switch (typeof filters[ name ]) {
        case 'string':
          // eslint-disable-next-line import/no-dynamic-require
          filter = require(filters[ name ]);
          break;
        case 'function':
        default:
          filter = filters[ name ];
          break;
      }
      env.addFilter(name, filter);
    }
  }
}

function configureNunjucks(engine, userConfig, source) {
  const paths = [ ...userConfig.paths, userConfig.removeSourceFromPath ? null : source ].filter(Boolean);
  const loaders = [
    new NodeLoader(paths, userConfig.nodeLoader),
  ];
  const env = userConfig.customEnvironment ?
    userConfig.customEnvironment(engine, loaders, userConfig, source) :
    new nunjucks.Environment(loaders, userConfig.config);

  if (userConfig.customFilters) {
    addCustomFilters(env, userConfig.customFilters);
  }

  nunjucks.installJinjaCompat();

  env.addFilter('raw', env.getFilter('safe'));

  return userConfig.custom ? userConfig.custom(env) : env;
}

function twigPlugin(config) {
  const configuration = {
    pages: [ '**.twig' ],
    layouts: [ 'layouts/*.twig' ],
    defaultLayout: 'default-layout',
    staticLayout: 'static-layout',
    nunjucks: {
      // Default path for template names.
      paths: [ process.cwd() ],
      config: {
        watch: false,
        autoescape: true,
        trimBlocks: true,
        lstripBlocks: true,
      },
      removeSourceFromPath: false, // Removes metalsmith.source('') from paths.
      customFilters: {},
      nodeLoader: {},
      filesystemLoader: {},
      customEnvironment: null,
      custom: null,
      ...(config.nunjucks || {}),
    },
    ...config,
  };

  return function (files, metalsmith, done) {
    const { defaultLayout, staticLayout } = configuration;
    const layouts = getLayouts(files, configuration.layouts, configuration.defaultLayout);

    // Validate that layouts fit our rules.
    validateLayouts(layouts, { defaultLayout, staticLayout });

    // get all the pages based on configuration and configure nunjucks.
    const pages = getPages(files, configuration.pages, configuration.layouts);
    const engine = configureNunjucks(
      nunjucks,
      configuration.nunjucks,
      metalsmith._source,
    );

    // Start rendering each template, returning mutations to make to files.
    const renameOps = Object.keys(pages).map(page => {
      const file = files[ page ];
      const text = renderTemplate({
        engine,
        file,
        fileName: page,
        layouts,
        defaultLayout,
        staticLayout,
        context: {...metalsmith.metadata(), ...file, files},
      });

      // defer any mutations until we've processed everything.
      return () => {
        editFileContents(files[ page ], text);
        editFileName(files, page, (page).replace(/\.[^/.]+$/, '.html'));
      };
    });

    // Rename step, keeps the contexts the same for all files being rendered.
    renameOps.forEach(op => op());

    // Removes layouts from build.
    Object.values(layouts).map(layout => layout.fileName).forEach(layoutName => {
      if (files[layoutName]) {
        files[layoutName] = null;
        delete files[layoutName];
      }
    })

    done();
  };
}


Metalsmith(__dirname)
  .metadata({ title: 'Testing metalsmith website', findMe: 'FOUND ME!' })
  .source('./src')
  .destination('./dist')
  .clean(true)
  .use(twigPlugin({
    pages: [ '**/*.twig' ],
    layouts: [ 'layouts/*.twig' ],
    defaultLayout: 'default-layout',
    staticLayout: 'static-layout',
  }))
  .build(err => {
    if (err) {
      console.error(err);
    }
    console.log('Done!');
    // process.exit(1);
  });
