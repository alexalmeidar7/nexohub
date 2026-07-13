import { MessageCircle, Sparkles } from "lucide-react";

/**
 * Placeholder da Home do Chatbot.
 * O layout final será definido pelo usuário — por enquanto, mantemos
 * uma tela limpa que indica o modo selecionado.
 */
export default function ChatbotHome() {
  return (
    <div className="w-full h-full min-h-[60vh] flex items-center justify-center px-6 py-10">
      <div
        className="w-full max-w-2xl rounded-3xl p-10 text-center relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #ffffff 0%, #d6f4fb 100%)",
          border: "1px solid rgba(0,191,240,0.25)",
          boxShadow: "0 20px 60px rgba(0,33,50,0.08)",
        }}
      >
        <div
          className="mx-auto mb-5 flex items-center justify-center rounded-full"
          style={{
            width: 76,
            height: 76,
            background: "#9fca1d",
            boxShadow: "0 10px 30px rgba(159,202,29,0.35)",
          }}
        >
          <MessageCircle size={36} color="#ffffff" strokeWidth={2.2} />
        </div>

        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-3 text-[10px] font-bold uppercase tracking-widest"
          style={{ background: "#002132", color: "#00dbff" }}
        >
          <Sparkles size={12} />
          Modo Chatbot
        </div>

        <h2
          className="text-3xl font-light mb-2"
          style={{ color: "#002132", fontFamily: "Montserrat, sans-serif" }}
        >
          Home do Chatbot
        </h2>
        <p
          className="text-sm max-w-md mx-auto"
          style={{ color: "#002132", opacity: 0.65 }}
        >
          Esta é a base da nova home dedicada ao Chatbot. Diga o que deseja
          exibir aqui e vamos montar juntos — a home do NexoHUB continua
          preservada e volta ao selecionar o pill <b>nexohub</b>.
        </p>
      </div>
    </div>
  );
}
