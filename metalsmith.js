const Metalsmith = require('metalsmith');
const multimatch = require('multimatch');
const path = require('path');
const nunjucks = require('nunjucks');
const ignoreFrontMatter = require('./metalsmith/ignoreFrontMatter');
const NodeLoader = require('./metalsmith/nodeLoader');

function getLayouts(files, pattern, defaultLayout) {
  return multimatch(Object.keys(files), pattern).reduce((acc, file) => {
    const fileObject = files[file];
    const layoutName = fileObject.layoutName || path.parse(file).name;
    acc[layoutName] = {fileName: file, file: files[file]};
    if (defaultLayout === layoutName && defaultLayout !== 'default-layout') {
      acc['default-layout'] = acc[layoutName];
    }
    return acc;
  }, {});
}

function getPages(files, pattern) {
  return multimatch(Object.keys(files), pattern).reduce((acc, file) => {
    acc[file] = files[file];
    return acc;
  }, {});
}

function validateLayouts(layouts, {defaultLayout, staticLayout}) {
  if (!layouts[defaultLayout] && defaultLayout !== 'default-layout') {
    throw new Error(`Configuration error: layout with the name ${defaultLayout} does not exist`);
  }
  if (!layouts[staticLayout] && staticLayout !== 'static-layout') {
    throw new Error(`Configuration error: layout with the name ${defaultLayout} does not exist`);
  }
}

function editFileName(files, oldName, newName) {
  files[newName] = files[oldName];
  files[oldName] = null;
  delete files[oldName];
  return files;
}

function editFileContents(file, newContents) {
  file.contents = newContents;
  return file;
}

function renderFile({ engine, fileName, fileString, context }) {
  return engine.renderString(fileString, context, {path: path.dirname(fileName)});
}

function renderStaticFile({ engine, staticFileName, staticFileString, fileName, fileString, context }) {
  return engine.renderString(staticFileString, {
    context,
    contents: engine.renderString(
      fileString,
      context,
      {path: path.dirname(fileName)}
    )
  }, {path: path.dirname(staticFileName)});
}

function renderTemplate({ engine, file, fileName, layouts, defaultLayout, staticLayout, context }) {
  if (file.static) {
    return renderStaticFile({
      engine,
      staticFileName: layouts[staticLayout].fileName,
      staticFileString: ignoreFrontMatter(layouts[staticLayout].file.contents.toString()),
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
    context
  })
}

function addLayoutToFile(file, layouts, defaultLayout) {
  if (file.layout === 'none') {
    return ignoreFrontMatter(file.contents.toString());
  }
  if (file.layout && layouts[file.layout]) {
    const layout = layouts[file.layout];

    return `{% extends '${layout.fileName}' %} \n ${ignoreFrontMatter(file.contents.toString())}`;
  }

  return `{% extends '${layouts[defaultLayout].fileName}' %} \n ${ignoreFrontMatter(file.contents.toString())}`;
}

function addCustomFilters(env, filters) {
  for (const name in filters || {}) {
    if ({}.hasOwnProperty.call(filters, name)) {
      let filter = null;
      switch (typeof filters[name]) {
        case 'string':
          // eslint-disable-next-line import/no-dynamic-require
          filter = require(filters[name]);
          break;
        case 'function':
        default:
          filter = filters[name];
          break;
      }
      env.addFilter(name, filter);
    }
  }
}

function configureNunjucks(engine, userConfig, source) {
  const paths = [...userConfig.paths, userConfig.removeSourceFromPath ? null : source].filter(Boolean);
  const loaders = [
    new NodeLoader(paths, userConfig.nodeLoader),
  ];
  const env = userConfig.customEnvironment ?
    userConfig.customEnvironment(engine, loaders, userConfig, source) :
    new nunjucks.Environment(loaders, userConfig.config);

  if (userConfig.customFilters) {
    addCustomFilters(env, userConfig.customFilters)
  }

  env.addFilter('raw', env.getFilter('safe'));

  return userConfig.custom ? userConfig.custom(env) : env;
}

function twigPlugin(config) {
  const configuration = {
    pages: ['index.twig', 'pages/**.twig'],
    layouts: ['layouts/*.twig'],
    defaultLayout: 'default-layout',
    staticLayout: 'static-layout',
    nunjucks: {
      // Default path for template names.
      paths: [process.cwd()],
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
      ...(config.nunjucks || {})
    },
    ...config,
  };

  return function(files, metalsmith, done) {
    const {defaultLayout, staticLayout} = configuration;
    const layouts = getLayouts(files, configuration.layouts, configuration.defaultLayout);

    validateLayouts(layouts, {defaultLayout, staticLayout});

    const pages = getPages(files, configuration.pages);
    const engine = configureNunjucks(
      nunjucks,
      configuration.nunjucks,
      metalsmith._source
    );

    Object.keys(pages).forEach(page => {
      const file = files[page];
      const context = {};
      const text = renderTemplate({
        engine,
        file,
        fileName: page,
        layouts,
        defaultLayout,
        staticLayout,
        context
      });
    });

    // console.log(files);
  };
}


Metalsmith(__dirname)
  .metadata({title: 'Testing metalsmith website'})
  .source('./src')
  .destination('./dist')
  .clean(true)
  .use(twigPlugin({
    pages: ['index.twig', 'pages/**.twig'],
    layouts: ['layouts/*.twig'],
    defaultLayout: 'default-layout',
    staticLayout: 'static-layout',
  }))
  .build(err => {
    if (err) {
      console.error(err);
    }
    // process.exit(1);
  });
