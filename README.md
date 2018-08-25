
### Configuration
Here is the default configuration
```
{
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
    removeSourceFromPath: false,
    customFilters: {},
    nodeLoader: {},
    filesystemLoader: {},
    customEnvironment: null,
    custom: null,
  }
}
```

##### configuration.pages
**default:** `['**.twig']`

This is a [Multimatch](https://www.npmjs.com/package/multimatch) pattern that specifies where to look for twig templates to render.

##### configuration.layouts
**default:** `['layouts/*.twig'']`

This is a [Multimatch](https://www.npmjs.com/package/multimatch) pattern that specifies where to look for twig templates used for layouts. [Layouts](#layouts) make it easy
to wrap non-twig 

##### configuration.defaultLayout
This is the identifier of the layout you want to be used when no layout is specified. This can also be set to `none` if you want no layout to be used at all by default.

### Layouts
There are two types of layouts, layouts and static-layouts. The first type is simply the equivalent of adding:
```twig
{% extends './my/layout.twig' %}
``` 
To the top of your template, as this is essentially what it does. It can be used to reduce boilerplate, convenience for a default layout without having to specify that line on every page and
also for being able to programmatically change layouts. 

This layout can be defined either in line in the front-matter of your twig template:
```twig
---
layout: my-layout
---
<div>
{% block body %}{% endblock %}
</div>
``` 
Note: this doesn't use a path to a layout, instead it uses an identifier.

Or in the plugin configuration under [configuration.defaultLayout](#configuration-defaultLayout)

* If you specify a default-layout, it must contain a block called `body` for the main content. This is used when a user does not specify a target block. (This may become configurable).
```
---
layoutName: default-layout
---
<body>
    {% block body %}{% endblock %}
</body>
```


### Todo
- Add default layout as string in plugin, so you can start without defining a layout
- Add default static-layout that will by default extend from the configured layout, or if that also does not exist, simply use a sensible default.