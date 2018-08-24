### Layouts
* If you specify a default-layout, it must contain a block called `body` for the main content. This is used when a user does not specify a target block. (This may become configurable).
```
---
layoutName: default-layout
---
<body>
    {% block body %}{% endblock %}
</body>
```