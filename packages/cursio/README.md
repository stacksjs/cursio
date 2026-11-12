# cursio

The client for [Cursio](https://cursio.org): read an academy's catalog and courses from your own app.

```bash
bun add cursio
```

```ts
import { createCursio } from 'cursio'

const cursio = createCursio({ url: 'https://cursio.org', academy: 'your-academy-slug' })
const { academy, courses } = await cursio.catalog()
const found = await cursio.course('stacks-bootcamp')
```

This package is the client only. To put the academy's catalog, player and sign-in on the pages of a Stacks app, install [`@cursio/academy`](https://www.npmjs.com/package/@cursio/academy) instead: it has the stx components and the routes, and exports this same client.

## License

MIT
