// Service para Gestão de Chamados de Suporte do House Mix com o Super Admin
export interface SupportMessage {
  id: string;
  sender_type: "client" | "superadmin";
  sender_name: string;
  message: string;
  created_at: string;
}

export type TicketStatus = "aberto" | "em_atendimento" | "solucionado";
export type TicketType = "ajuda" | "falha" | "duvida";
export type TicketPriority = "baixa" | "media" | "alta" | "urgente";

export interface SupportTicket {
  id: string;
  ticket_number: string; // Ex: #SUP-2609-041
  client_id: string;
  client_name: string;
  client_email: string;
  tipo: TicketType;
  titulo: string;
  descricao: string;
  prioridade: TicketPriority;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  finalizado_em: string | null;
  finalizado_por: string | null;
  solucao_resumo?: string;
  messages: SupportMessage[];
}

const STORAGE_KEY = "nexohub_suporte_tickets_v1";

function generateTicketNumber(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const rand = Math.floor(100 + Math.random() * 900); // 3 dígitos
  return `#SUP-${yy}${mm}-${rand}`;
}

const DEFAULT_DEMO_TICKETS: SupportTicket[] = [
  {
    id: "ticket-demo-1",
    ticket_number: "#SUP-2609-012",
    client_id: "d17e65af-e407-466f-9b60-b55c43399513",
    client_name: "Positiva FM 99.1",
    client_email: "positivafm@positivafm.com.br",
    tipo: "falha",
    titulo: "Sincronização de Capas de Música no Ar",
    descricao: "Algumas músicas tocadas na madrugada não estavam carregando as capas em alta resolução no estúdio.",
    prioridade: "alta",
    status: "solucionado",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    finalizado_em: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    finalizado_por: "Super Admin Nexo",
    solucao_resumo: "Ajustada a rota de fallback para iTunes e Deezer API. Sincronização restabelecida com sucesso.",
    messages: [
      {
        id: "msg-1-1",
        sender_type: "client",
        sender_name: "Positiva FM",
        message: "Olá equipe Nexo! Notamos que na madrugada algumas músicas internacionais ficaram sem a capa no monitor do estúdio.",
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
      },
      {
        id: "msg-1-2",
        sender_type: "superadmin",
        sender_name: "Super Admin Nexo",
        message: "Olá Positiva FM! Já identificamos a causa: era uma oscilação na rota de busca de capas. Aplicamos uma atualização de sincronização imediata em segundo plano.",
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
      },
      {
        id: "msg-1-3",
        sender_type: "client",
        sender_name: "Positiva FM",
        message: "Perfeito, acabamos de testar e as capas voltaram a carregar instantaneamente! Muito obrigado.",
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      },
      {
        id: "msg-1-4",
        sender_type: "superadmin",
        sender_name: "Super Admin Nexo",
        message: "Excelente! Estamos finalizando este suporte com solução confirmada. Qualquer nova dúvida, estamos à disposição.",
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      },
    ],
  },
  {
    id: "ticket-demo-2",
    ticket_number: "#SUP-2609-028",
    client_id: "d17e65af-e407-466f-9b60-b55c43399513",
    client_name: "Positiva FM 99.1",
    client_email: "positivafm@positivafm.com.br",
    tipo: "ajuda",
    titulo: "Dúvida sobre integração do XML da Enquete no vMix",
    descricao: "Gostaríamos de orientações sobre como atualizar a enquete ativa sem precisar recarregar o input no vMix.",
    prioridade: "media",
    status: "aberto",
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    finalizado_em: null,
    finalizado_por: null,
    messages: [
      {
        id: "msg-2-1",
        sender_type: "client",
        sender_name: "Positiva FM",
        message: "Olá! Como funciona a atualização automática da enquete no vMix? Quando colocamos uma enquete no ar, ela atualiza direto ou precisamos forçar o recarregamento no vMix?",
        created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      },
      {
        id: "msg-2-2",
        sender_type: "superadmin",
        sender_name: "Super Admin Nexo",
        message: "Olá! O XML em /enquete.xml atualiza em tempo real. No vMix, certifique-se de configurar o Data Source com atualização automática a cada 5 segundos. Acabamos de disponibilizar também o botão 'NO AR' na tabela de enquetes!",
        created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
      },
    ],
  },
];

export function getStoredTickets(userIdOrEmail?: string | null, isSuperAdmin: boolean = false): SupportTicket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (isSuperAdmin || !userIdOrEmail) return parsed;
        return parsed.filter(t => t.client_id === userIdOrEmail || (t.client_email && t.client_email.toLowerCase() === userIdOrEmail.toLowerCase()));
      }
    }
  } catch {}
  // Salva os dados padrão inicial
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DEMO_TICKETS));
  } catch {}
  if (isSuperAdmin || !userIdOrEmail) return DEFAULT_DEMO_TICKETS;
  return DEFAULT_DEMO_TICKETS.filter(t => t.client_id === userIdOrEmail || (t.client_email && t.client_email.toLowerCase() === userIdOrEmail.toLowerCase()));
}

export function saveStoredTickets(tickets: SupportTicket[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
    // Notifica outros componentes e abas
    window.dispatchEvent(new CustomEvent("chatbot:suporte_updated", { detail: { tickets } }));
    window.dispatchEvent(new CustomEvent("chatbot:unread_updated"));

    // Envia para o servidor local Vite para sincronizar entre navegadores
    fetch("/api/suporte-tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickets }),
    }).catch(() => {});
  } catch (err) {
    console.warn("Erro ao salvar chamados de suporte:", err);
  }
}

export async function fetchServerTickets(): Promise<SupportTicket[]> {
  try {
    const res = await fetch("/api/suporte-tickets");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        window.dispatchEvent(new CustomEvent("chatbot:suporte_updated", { detail: { tickets: data } }));
        return data;
      }
    }
  } catch {}
  return getStoredTickets();
}

export function createSupportTicket(params: {
  clientId: string;
  clientName: string;
  clientEmail: string;
  tipo: TicketType;
  titulo: string;
  descricao: string;
  prioridade?: TicketPriority;
}): SupportTicket {
  const current = getStoredTickets();
  const id = `ticket_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ticketNumber = generateTicketNumber();
  const nowIso = new Date().toISOString();

  const initialMessage: SupportMessage = {
    id: `msg_${Date.now()}_init`,
    sender_type: "client",
    sender_name: params.clientName,
    message: params.descricao,
    created_at: nowIso,
  };

  const newTicket: SupportTicket = {
    id,
    ticket_number: ticketNumber,
    client_id: params.clientId,
    client_name: params.clientName,
    client_email: params.clientEmail,
    tipo: params.tipo,
    titulo: params.titulo,
    descricao: params.descricao,
    prioridade: params.prioridade || "media",
    status: "aberto",
    created_at: nowIso,
    updated_at: nowIso,
    finalizado_em: null,
    finalizado_por: null,
    messages: [initialMessage],
  };

  const updated = [newTicket, ...current];
  saveStoredTickets(updated);
  return newTicket;
}

export function addMessageToTicket(
  ticketId: string,
  messageText: string,
  senderType: "client" | "superadmin",
  senderName: string
): SupportTicket | null {
  const current = getStoredTickets();
  const ticketIndex = current.findIndex((t) => t.id === ticketId);
  if (ticketIndex === -1) return null;

  const nowIso = new Date().toISOString();
  const newMessage: SupportMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sender_type: senderType,
    sender_name: senderName,
    message: messageText,
    created_at: nowIso,
  };

  const existingTicket = current[ticketIndex];
  const newStatus =
    senderType === "superadmin" && existingTicket.status === "aberto"
      ? "em_atendimento"
      : existingTicket.status;

  const updatedTicket: SupportTicket = {
    ...existingTicket,
    status: newStatus,
    updated_at: nowIso,
    messages: [...existingTicket.messages, newMessage],
  };

  const updatedList = [...current];
  updatedList[ticketIndex] = updatedTicket;
  saveStoredTickets(updatedList);
  return updatedTicket;
}

export function updateTicketStatus(
  ticketId: string,
  newStatus: TicketStatus,
  finalizadoPor: string = "Super Admin",
  solucaoResumo?: string
): SupportTicket | null {
  const current = getStoredTickets();
  const ticketIndex = current.findIndex((t) => t.id === ticketId);
  if (ticketIndex === -1) return null;

  const existing = current[ticketIndex];
  const nowIso = new Date().toISOString();

  const isResolving = newStatus === "solucionado";
  const updatedTicket: SupportTicket = {
    ...existing,
    status: newStatus,
    updated_at: nowIso,
    finalizado_em: isResolving ? nowIso : null,
    finalizado_por: isResolving ? finalizadoPor : null,
    solucao_resumo: isResolving ? (solucaoResumo || existing.solucao_resumo || "Suporte solucionado e validado.") : undefined,
  };

  const updatedList = [...current];
  updatedList[ticketIndex] = updatedTicket;
  saveStoredTickets(updatedList);
  return updatedTicket;
}
