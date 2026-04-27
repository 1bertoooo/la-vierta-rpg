import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function LobbyPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="relative min-h-screen px-6 py-12 pergaminho-texture">
      <div className="max-w-4xl mx-auto epico-entrada">
        <p className="text-xs uppercase tracking-[0.4em] text-[var(--color-pergaminho-velho)] mb-2">
          Bem-vindo de volta
        </p>
        <h1 className="text-5xl md:text-6xl text-[var(--color-dourado-claro)] dourado-glow mb-4">
          Lobby da Élite
        </h1>
        <div className="w-24 h-px bg-gradient-to-r from-[var(--color-dourado)] to-transparent mb-8" />

        <p className="text-[var(--color-pergaminho)] italic text-lg mb-12">
          Saudações, <span className="text-[var(--color-dourado)]">{user.email}</span>.
          O reino aguarda.
        </p>

        <div className="bg-[var(--color-carvao)]/60 border border-[var(--color-pergaminho-velho)]/30 rounded-lg p-8">
          <h2 className="text-2xl text-[var(--color-dourado)] mb-4">
            Campanha 1 — A Maldição de Bruna LaVierta
          </h2>
          <p className="text-[var(--color-pergaminho)] leading-relaxed mb-6">
            A Liga dos Quatro ainda não foi formada. Em breve, cada um escolherá sua raça,
            sua classe, e tomará seu lugar na lenda.
          </p>
          <p className="text-sm text-[var(--color-pedra)] italic">
            (Próxima etapa do roadmap: criação de personagem.)
          </p>
        </div>
      </div>
    </main>
  );
}
