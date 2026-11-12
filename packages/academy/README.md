# @cursio/academy

Run a [Cursio](https://cursio.org) academy inside your own Stacks app. Your app keeps its own brand and pages; the courses, lessons, progress and learner accounts stay in Cursio.

## Install

```bash
bun add @cursio/academy
./buddy package:discover
```

Set which academy the app is the front of:

```bash
CURSIO_URL=https://cursio.org
CURSIO_ACADEMY=your-academy-slug
```

## What you get

- **Components**, usable by tag name in any stx view:
  - `<CursioCatalog :school :entries home api />` lists the published courses, with topic filters and a "Continue watching" row for signed-in learners.
  - `<CursioPlayer :school :course :outline home path api />` is the course page: outline, lessons, video, notes, quizzes, assignments, progress and the certificate link.
  - `<CursioSignIn mode="login|register" auth home />` signs a learner in to the academy from your page.
- **A client** for your server scripts:

  ```ts
  import { createCursio } from '@cursio/academy'

  const cursio = createCursio({ url: env.CURSIO_URL, academy: env.CURSIO_ACADEMY })
  const { academy, courses } = await cursio.catalog()
  const found = await cursio.course('stacks-bootcamp')
  ```

- **Forwarding routes** under `/api/cursio`. A learner's browser only talks to your app, and your app passes the call on to Cursio. Only sign-in and the learner API are forwarded, and only for the academy you configured.
- **A stylesheet** at `/api/cursio/academy.css` with what the components need beyond utility classes.

## A page

```html
<script server>
import { createCursio } from '@cursio/academy'

const { academy, courses } = await createCursio({ url: env.CURSIO_URL, academy: env.CURSIO_ACADEMY }).catalog()
</script>
<CursioCatalog :school="academy" :entries="courses" home="/courses" api="/api/cursio/learn" />
```

## Branding

The components paint with nine color names. Define them as CSS variables and map them in `config/css.ts`:

`--page`, `--surface`, `--tint`, `--ink`, `--muted`, `--line`, `--accent`, `--accent-ink`, `--accent-soft`

```ts
// config/css.ts
content: ['./node_modules/@cursio/academy/components/**/*.stx'],
theme: { extend: { colors: { page: 'var(--page)', surface: 'var(--surface)', /* ... */ } } },
```

Add the `content` line or the classes used only inside the components are never generated.

## License

MIT
