# Deployment context

Update existing Zeabur service IDs; do not deploy templates again into this initialized project.

## Zeabur Deployment

- Project ID: `6ac28b9d93154e21e628fc9f`
- Environment ID: `6ac28b9d6a873116ad5cbbbb`
- Unified application Service ID: `6ac28fa30bdfb9653793d1bb` (hui-business; web, API, worker, backups)
- PostgreSQL Service ID: `6ac28bf60bdfb9653793d03e`
- Application volume: `application` mounted at `/data`; preserve across updates.
- Current verified image: `ghcr.io/sakuralaaa/hui-business-api:49afcbc35a2062380dfbb4c22a098f02c3b211f4`.

The old split deployment is suspended. See `docs/zeabur-cleanup.md` for its cleanup status; never resume those services during ordinary updates. Preserve database volumes, originals, encryption key and mapping versions. Credentials belong in Zeabur variables or ignored handoff files, never here.
