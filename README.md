# Nathan & Innocente — mariage-next

Application Next.js du site mariage : invitation invités, vitrine, admin.

## Développement local

```bash
npm install
cp .env.example .env
# Renseigner DATABASE_URL et les autres variables

npm run db:push
npm run db:seed
npm run dev
```

- `/` et `/home` — vitrine du site
- `/login` — invitation (login WhatsApp)
- `/admin` — back-office

## Déploiement Vercel

### 1. Importer le projet

1. [vercel.com/new](https://vercel.com/new) → importer le repo GitHub `nathan-innocente`
2. **Root Directory** : laisser `/` (racine du repo = `mariage-next`)
3. **Framework** : Next.js (détecté automatiquement)
4. **Build Command** : `npm run build` (inclut `prisma generate`)
5. **Install Command** : `npm install`

### 2. Variables d'environnement

Configurer dans **Vercel → Settings → Environment Variables** (Production + Preview) :

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `DATABASE_URL` | ✓ | URL Neon **pooler** (`-pooler` dans le hostname) |
| `ADMIN_PASSWORD` | ✓ | Mot de passe admin |
| `APP_URL` | ✓ | URL publique (`https://nathan-innocente.com`) |
| `TWILIO_ACCOUNT_SID` | ✓ | Twilio |
| `TWILIO_AUTH_TOKEN` | ✓ | Twilio |
| `TWILIO_WHATSAPP_FROM` | ✓ | Numéro WhatsApp Twilio |
| `TWILIO_TEMPLATE_*` | ✓ | IDs templates WhatsApp (4 variables) |
| `NEXT_PUBLIC_DRESS_CODE_BASE_URL` | ✓ | URL publique R2 dress code |
| `NEXT_PUBLIC_DRESS_CODE_FILE_COUTUMIER` | ✓ | Nom du PDF coutumier |

Variables optionnelles : `VDOCIPHER_*`, fichiers dress code civile/religieux.

> Ne pas configurer `GUESTS_JSON_PATH` sur Vercel — le seed s'exécute en local uniquement.

### 3. Base de données

Le schéma est déjà sur Neon. En cas de modification :

```bash
npm run db:push   # local, contre DATABASE_URL de prod ou staging
```

### 4. Domaine custom

Vercel → **Settings → Domains** :

- `nathan-innocente.com` → Production
- Mettre à jour `APP_URL` avec le domaine final

### 5. Déployer

```bash
# CLI (optionnel)
npx vercel login
npx vercel --prod
```

Ou push sur `main` → déploiement automatique si GitHub est connecté.

### 6. Vérifications post-déploiement

- [ ] `/` — login invitation
- [ ] `/admin` — connexion admin
- [ ] Téléchargement dress code (PDF)
- [ ] Envoi WhatsApp test (admin)
- [ ] Cookies HTTPS en production

## Structure

```
app/           Routes Next.js (pages + API)
components/    UI (invitation, home, admin)
lib/           Prisma, Twilio, auth, contenu
prisma/        Schéma + seed
public/        Assets statiques (img, css legacy)
```
