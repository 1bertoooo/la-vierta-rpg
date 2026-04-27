# La Vierta: O RPG

> Um RPG online de fantasia épica para a Liga dos Quatro da Élite — Humberto, Isabel Yumi, Luiz Nogueira e Nelson Claudino. Mestre IA, narração com voz, mapa com tokens, persistência total entre sessões.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind 4
- **Supabase** (Postgres + Realtime + Auth)
- **Groq** (Llama 3.3 70B) — IA-mestra Camada 1
- **Google Gemini 2.5 Pro** — IA-mestra Camada 2 (cenas-chave)
- **Web Speech API** — TTS narrador
- **Pollinations.ai** — geração de retratos
- **Tabletop Audio + Pixabay** — música/SFX

Custo total: **R$ 0/mês**.

Ver `../La_Vierta_Estrategia.md` pra estratégia completa (12 etapas + bônus, lore profunda, Apêndice A com Bíblia de Easter Eggs).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
