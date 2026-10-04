# Deployment context

Use the existing Zeabur service IDs when updating this installation; do not deploy the templates again into the initialized project.

## Zeabur Deployment

- Project ID: `6ac28b9d93154e21e628fc9f`
- Web Service ID: `6ac28fa30bdfb9653793d1bb`
- API Service ID: `6ac28fa30bdfb9653793d1bd`
- Worker Service ID: `6ac28fa30bdfb9653793d1bc`
- PostgreSQL Service ID: `6ac28bf60bdfb9653793d03e`
- RustFS Service ID: `6ac28d4c0bdfb9653793d0c0`
- Bootstrap Service ID: `6ac28dc10bdfb9653793d0ee` (suspend after initialization)
- Database Backup Service ID: `6ac292d90bdfb9653793d2a3`
- Originals Backup Service ID: `6ac292d90bdfb9653793d2a2`

Application images are pinned to the tested commit recorded in `docs/zeabur-deployment.md`. Preserve the database volumes, original-file bucket, encryption key and current mapping versions across upgrades. Credentials belong in Zeabur variables or ignored local handoff files, never here.
