import { useState, useEffect, useRef } from "react";
import {
  Headphones, Plus, Search, MessageSquare, Check, CheckCheck, Clock,
  AlertCircle, ShieldCheck, Send, RefreshCw, X, ChevronRight, User,
  HelpCircle, Bug, Sparkles, ArrowRight, CornerDownLeft, ExternalLink,
  RotateCcw
} from "lucide-react";
import {
  SupportTicket,
  SupportMessage,
  TicketStatus,
  TicketType,
  TicketPriority,
  getStoredTickets,
  createSupportTicket,
  addMessageToTicket,
  updateTicketStatus,
  fetchServerTickets
} from "@/lib/supportService";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirmDialog";
import { useAuth } from "@/hooks/useAuth";

interface SupportTabProps {
  userId?: string;
  clientAcc?: any;
}

export default function SupportTab({ userId, clientAcc }: SupportTabProps) {
  const { user, role } = useAuth();
  const isSuperAdmin = role === "admin";
  const clientEmail = clientAcc?.email || user?.email || "";
  const clientName = clientAcc?.nome || user?.email?.split("@")[0] || "Emissora";
  const effectiveId = userId || clientAcc?.id || user?.id || "";

  const filterTicketsForUser = (list: SupportTicket[]) => {
    if (isSuperAdmin) return list;
    return list.filter((t) => {
      const matchId = effectiveId && t.client_id === effectiveId;
      const matchEmail = clientEmail && t.client_email?.toLowerCase() === clientEmail.toLowerCase();
      return matchId || matchEmail;
    });
  };

  const [tickets, setTickets] = useState<SupportTicket[]>(() => {
    return filterTicketsForUser(getStoredTickets());
  });
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(() => {
    const list = filterTicketsForUser(getStoredTickets());
    return list.length > 0 ? list[0].id : null;
  });
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [senderRole, setSenderRole] = useState<"client" | "superadmin">("client");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states for new ticket
  const [formTipo, setFormTipo] = useState<TicketType>("ajuda");
  const [formTitulo, setFormTitulo] = useState("");
  const [formDescricao, setFormDescricao] = useState("");
  const [formPrioridade, setFormPrioridade] = useState<TicketPriority>("media");

  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Reload tickets
  const refreshTickets = () => {
    fetchServerTickets().then((loaded) => {
      setTickets(filterTicketsForUser(loaded));
    });
  };

  useEffect(() => {
    refreshTickets();

    const handleUpdate = () => {
      setTickets(filterTicketsForUser(getStoredTickets()));
    };
    window.addEventListener("chatbot:suporte_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);

    return () => {
      window.removeEventListener("chatbot:suporte_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [effectiveId, clientEmail, isSuperAdmin]);

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || null;

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [selectedTicket?.messages?.length, selectedTicketId]);

  // Filtered tickets
  const filteredTickets = tickets.filter((t) => {
    if (filter === "open" && t.status === "solucionado") return false;
    if (filter === "resolved" && t.status !== "solucionado") return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      t.ticket_number.toLowerCase().includes(term) ||
      t.titulo.toLowerCase().includes(term) ||
      t.descricao.toLowerCase().includes(term)
    );
  });

  const openTicketsCount = tickets.filter((t) => t.status !== "solucionado").length;
  const resolvedTicketsCount = tickets.filter((t) => t.status === "solucionado").length;

  const handleSendMessage = () => {
    if (!selectedTicket || !messageInput.trim()) return;

    const senderName = senderRole === "superadmin" ? "Super Admin Nexo" : clientName;
    const updated = addMessageToTicket(
      selectedTicket.id,
      messageInput.trim(),
      senderRole,
      senderName
    );

    if (updated) {
      setTickets(getStoredTickets());
      setMessageInput("");
      toast.success("Mensagem enviada com sucesso!");
    }
  };

  const handleResolveTicket = async () => {
    if (!selectedTicket) return;
    const confirmed = await confirmDialog({
      title: "Finalizar Suporte",
      message: `Deseja marcar o chamado ${selectedTicket.ticket_number} como solucionado e finalizado?`,
      confirmLabel: "Finalizar & Solucionar",
      cancelLabel: "Cancelar",
    });

    if (!confirmed) return;

    const updated = updateTicketStatus(
      selectedTicket.id,
      "solucionado",
      senderRole === "superadmin" ? "Super Admin Nexo" : clientName,
      "Suporte finalizado com sucesso."
    );

    if (updated) {
      setTickets(getStoredTickets());
      toast.success(`Suporte ${selectedTicket.ticket_number} marcado como solucionado!`);
    }
  };

  const handleReopenTicket = () => {
    if (!selectedTicket) return;
    const updated = updateTicketStatus(selectedTicket.id, "aberto");
    if (updated) {
      setTickets(getStoredTickets());
      toast.info(`Suporte ${selectedTicket.ticket_number} foi reaberto.`);
    }
  };

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitulo.trim() || !formDescricao.trim()) {
      toast.error("Por favor, preencha o assunto e a descrição do suporte.");
      return;
    }

    const created = createSupportTicket({
      clientId: effectiveId,
      clientName,
      clientEmail,
      tipo: formTipo,
      titulo: formTitulo.trim(),
      descricao: formDescricao.trim(),
      prioridade: formPrioridade,
    });

    setTickets(getStoredTickets());
    setSelectedTicketId(created.id);
    setIsModalOpen(false);
    setFormTitulo("");
    setFormDescricao("");
    toast.success(`Chamado ${created.ticket_number} aberto com sucesso!`);
  };

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return "";
    try {
      return format(new Date(isoString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-[600px] text-slate-800">
      {/* Coluna Esquerda: Lista de Chamados */}
      <div className="w-full lg:w-[380px] border-r border-slate-200/90 bg-white/70 flex flex-col shrink-0">
        {/* Topo: Botão Novo Suporte */}
        <div className="p-4 border-b border-slate-200/90 space-y-3 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#0055ff]/10 text-[#0055ff] flex items-center justify-center font-bold">
                <Headphones size={17} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-[#0A2540]">
                  Atendimento & Suporte
                </h3>
                <p className="text-[10px] text-slate-400 font-medium">Chamados diretos com o Super Admin</p>
              </div>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#0055ff] text-white hover:bg-blue-600 transition shadow-sm hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <Plus size={14} />
              <span>Novo Suporte</span>
            </button>
          </div>

          {/* Filtros em pills */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-full text-[11px] font-bold">
            <button
              onClick={() => setFilter("all")}
              className={`flex-1 py-1 rounded-full text-center transition ${
                filter === "all" ? "bg-white text-[#0055ff] shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Todos ({tickets.length})
            </button>
            <button
              onClick={() => setFilter("open")}
              className={`flex-1 py-1 rounded-full text-center transition flex items-center justify-center gap-1 ${
                filter === "open" ? "bg-white text-[#0055ff] shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <span>Abertos</span>
              {openTicketsCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] flex items-center justify-center">
                  {openTicketsCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilter("resolved")}
              className={`flex-1 py-1 rounded-full text-center transition ${
                filter === "resolved" ? "bg-white text-emerald-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Solucionados ({resolvedTicketsCount})
            </button>
          </div>

          {/* Barra de Busca */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por número (#SUP) ou assunto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0055ff]"
            />
          </div>
        </div>

        {/* Lista de Tickets */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100/90">
          {filteredTickets.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Headphones size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs font-semibold text-slate-600">Nenhum suporte encontrado</p>
              <p className="text-[11px] text-slate-400 mt-1">Clique em "Novo Suporte" para abrir um chamado.</p>
            </div>
          ) : (
            filteredTickets.map((t) => {
              const isSelected = t.id === selectedTicketId;
              const isResolved = t.status === "solucionado";
              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTicketId(t.id)}
                  className={`p-3.5 cursor-pointer transition-all ${
                    isSelected
                      ? "bg-blue-50/80 border-l-4 border-l-[#0055ff]"
                      : "hover:bg-slate-50/80"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-xs font-extrabold text-[#0055ff] tracking-tight bg-blue-100/60 px-2 py-0.5 rounded-md">
                      {t.ticket_number}
                    </span>
                    {isResolved ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCheck size={11} />
                        SOLUCIONADO
                      </span>
                    ) : t.status === "em_atendimento" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                        <Clock size={11} />
                        EM ATENDIMENTO
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
                        ABERTO
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs font-bold text-[#0A2540] truncate leading-snug">
                    {t.titulo}
                  </h4>
                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                    {t.descricao}
                  </p>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      {t.tipo === "falha" ? (
                        <span className="text-rose-600 font-semibold flex items-center gap-0.5">
                          <Bug size={10} /> Falha
                        </span>
                      ) : (
                        <span className="text-blue-600 font-semibold flex items-center gap-0.5">
                          <HelpCircle size={10} /> Ajuda
                        </span>
                      )}
                      <span>•</span>
                      <span>{t.messages.length} msg(s)</span>
                    </span>
                    <span>{formatDateTime(t.created_at).split(" às ")[0]}</span>
                  </div>

                  {isResolved && t.finalizado_em && (
                    <div className="mt-1 text-[9px] text-emerald-700 font-medium">
                      ✓ Finalizado em {formatDateTime(t.finalizado_em)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Coluna Direita: Conversa & Acompanhamento */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedTicket ? (
          <>
            {/* Header do Chamado Selecionado */}
            <div className="p-4 border-b border-slate-200/90 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-black text-[#0055ff] tracking-tight bg-blue-100 px-2.5 py-0.5 rounded-lg border border-blue-200">
                    {selectedTicket.ticket_number}
                  </span>
                  {selectedTicket.status === "solucionado" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-extrabold px-3 py-1 rounded-full bg-emerald-500 text-white shadow-xs">
                      <CheckCheck size={13} />
                      SOLUCIONADO & FINALIZADO
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-1 rounded-full bg-blue-600 text-white shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                      EM ANDAMENTO
                    </span>
                  )}

                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                    {selectedTicket.tipo === "falha" ? "Relato de Falha" : "Ajuda no Sistema"}
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                    Prioridade: {selectedTicket.prioridade.toUpperCase()}
                  </span>
                </div>

                <h2 className="text-sm md:text-base font-black text-[#0A2540] mt-1.5">
                  {selectedTicket.titulo}
                </h2>
                <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                  <span>Solicitante: <strong className="text-slate-600">{selectedTicket.client_name}</strong></span>
                  <span>•</span>
                  <span>Aberto em: {formatDateTime(selectedTicket.created_at)}</span>
                  {selectedTicket.finalizado_em && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-700 font-bold">
                        Finalizado em: {formatDateTime(selectedTicket.finalizado_em)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Botões de Ação do Chamado */}
              <div className="flex items-center gap-2">
                {selectedTicket.status !== "solucionado" ? (
                  <button
                    onClick={handleResolveTicket}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition active:scale-95 cursor-pointer"
                  >
                    <CheckCheck size={14} />
                    <span>Marcar como Solucionado</span>
                  </button>
                ) : (
                  <button
                    onClick={handleReopenTicket}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 transition active:scale-95 cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>Reabrir Chamado</span>
                  </button>
                )}

                {/* Seletor de Papel (Para testes e Super Admin) */}
                <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl text-[10px] font-bold">
                  <span className="text-slate-500 px-1">Enviar como:</span>
                  <button
                    onClick={() => setSenderRole("client")}
                    className={`px-2 py-0.5 rounded-lg transition ${
                      senderRole === "client" ? "bg-white text-blue-700 shadow-xs" : "text-slate-600"
                    }`}
                  >
                    Emissora
                  </button>
                  <button
                    onClick={() => setSenderRole("superadmin")}
                    className={`px-2 py-0.5 rounded-lg transition ${
                      senderRole === "superadmin" ? "bg-[#0055ff] text-white shadow-xs" : "text-slate-600"
                    }`}
                  >
                    Super Admin
                  </button>
                </div>
              </div>
            </div>

            {/* Banner de Finalização se solucionado */}
            {selectedTicket.status === "solucionado" && (
              <div className="bg-emerald-50 border-b border-emerald-200/80 px-4 py-2.5 flex items-center justify-between text-xs text-emerald-900">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                    <Check size={12} />
                  </div>
                  <div>
                    <strong>Suporte Finalizado e Solucionado:</strong> {selectedTicket.solucao_resumo || "Problema tratado e validado pela equipe."}
                    <span className="text-emerald-700 ml-2">({formatDateTime(selectedTicket.finalizado_em)})</span>
                  </div>
                </div>
              </div>
            )}

            {/* Thread de Mensagens */}
            <div ref={messagesContainerRef} className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4 bg-slate-50/40">
              {/* Primeira mensagem (Abertura do chamado) */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs max-w-2xl">
                <div className="flex items-center justify-between text-xs mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                      {selectedTicket.client_name.charAt(0)}
                    </div>
                    <span className="font-bold text-slate-800">{selectedTicket.client_name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-semibold">
                      Abertura do Chamado
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {formatDateTime(selectedTicket.created_at)}
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {selectedTicket.descricao}
                </p>
              </div>

              {/* Mensagens subsequentes */}
              {selectedTicket.messages.slice(1).map((msg) => {
                const isSuperAdmin = msg.sender_type === "superadmin";
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isSuperAdmin ? "items-start" : "items-end"}`}
                  >
                    <div
                      className={`max-w-xl p-4 rounded-2xl text-xs leading-relaxed shadow-xs ${
                        isSuperAdmin
                          ? "bg-white border border-blue-200 text-slate-800 rounded-tl-sm shadow-[0_2px_12px_rgba(0,85,255,0.06)]"
                          : "bg-[#0055ff] text-white rounded-tr-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          {isSuperAdmin ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600 text-white text-[9px] font-black uppercase tracking-wider">
                              <ShieldCheck size={11} />
                              Super Admin Nexo
                            </span>
                          ) : (
                            <span className="font-bold text-blue-100 text-[11px]">
                              {msg.sender_name}
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] ${isSuperAdmin ? "text-slate-400" : "text-blue-200"}`}>
                          {formatDateTime(msg.created_at)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap">{msg.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input de Envio de Mensagem */}
            <div className="p-4 border-t border-slate-200 bg-white">
              <div className="flex items-end gap-2 max-w-4xl mx-auto">
                <div className="flex-1 relative">
                  <textarea
                    rows={2}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={`Escreva uma resposta como ${
                      senderRole === "superadmin" ? "Super Admin" : "Emissora"
                    }... (Pressione Enter para enviar)`}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#0055ff] focus:bg-white transition"
                  />
                </div>
                <button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  className="h-10 px-4 rounded-xl bg-[#0055ff] hover:bg-blue-600 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer shrink-0"
                >
                  <Send size={14} />
                  <span>Enviar</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <div className="w-16 h-16 rounded-3xl bg-blue-50 text-[#0055ff] flex items-center justify-center mb-4">
              <Headphones size={32} />
            </div>
            <h3 className="text-sm font-bold text-slate-700">Selecione um chamado de suporte</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1 mb-4">
              Ou clique no botão abaixo para abrir uma nova solicitação diretamente com a equipe do Super Admin.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-[#0055ff] text-white hover:bg-blue-600 transition shadow-sm"
            >
              <Plus size={14} />
              <span>Abrir Novo Suporte</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal: Abertura de Novo Chamado */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-start pt-10 sm:pt-14 justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl border border-slate-100 space-y-3.5 max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-2xl bg-[#0055ff]/10 text-[#0055ff] flex items-center justify-center font-bold">
                  <Headphones size={17} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#0A2540] uppercase">Novo Chamado de Suporte</h3>
                  <p className="text-[10px] text-slate-400">Atendimento direto com o Super Admin Nexo</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-3">
              {/* Seleção de Tipo */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Tipo de Atendimento
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setFormTipo("ajuda")}
                    className={`p-3 rounded-2xl border-2 cursor-pointer transition ${
                      formTipo === "ajuda"
                        ? "border-[#0055ff] bg-blue-50/50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-[#0A2540]">
                      <HelpCircle size={15} className="text-[#0055ff]" />
                      <span>Ajuda no Sistema</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                      Dúvidas de configuração, cadastros ou operação da plataforma.
                    </p>
                  </div>

                  <div
                    onClick={() => setFormTipo("falha")}
                    className={`p-3 rounded-2xl border-2 cursor-pointer transition ${
                      formTipo === "falha"
                        ? "border-rose-500 bg-rose-50/50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-xs text-rose-700">
                      <Bug size={15} className="text-rose-600" />
                      <span>Relato de Falha / Bug</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                      Erros de conexão, transmissão, XML ou comportamentos anômalos.
                    </p>
                  </div>
                </div>
              </div>

              {/* Assunto */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                  Assunto / Título
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Dúvida sobre atualização do XML da Enquete no vMix"
                  value={formTitulo}
                  onChange={(e) => setFormTitulo(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0055ff]"
                />
              </div>

              {/* Prioridade */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                  Prioridade
                </label>
                <div className="flex items-center gap-2">
                  {(["baixa", "media", "alta", "urgente"] as TicketPriority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFormPrioridade(p)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold uppercase transition ${
                        formPrioridade === p
                          ? p === "urgente"
                            ? "bg-rose-600 text-white"
                            : p === "alta"
                            ? "bg-amber-500 text-white"
                            : "bg-[#0055ff] text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descrição Detalhada */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
                  Descrição do Problema ou Dúvida
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Descreva detalhadamente o que precisa de ajuda ou qual falha identificou no sistema..."
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#0055ff]"
                />
              </div>

              {/* Rodapé do Modal */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#0055ff] hover:bg-blue-600 text-white shadow-sm transition active:scale-95 cursor-pointer"
                >
                  Abrir Suporte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
