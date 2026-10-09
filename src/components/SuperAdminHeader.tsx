import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import logoNxo from "@/assets/logo-nxo.png";
import {
  Bell, Settings, Calendar as CalendarIcon, Search, ChevronDown, Radio, Users,
  Package, Music, Layers, Smartphone, Palette, LogOut, Check, ArrowRight,
  Camera, Upload, Trash2, User, Mail, X, Loader2, Building2, DollarSign, Bot,
  FileText, Gift, Siren, Tag, MonitorPlay, Film, Mic2, Globe, CalendarDays, Home,
  Sparkles, ChevronRight as ChevronRightIcon
} from "lucide-react";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { compressImage } from "@/lib/imageCompressor";
import { toast } from "sonner";
import { getStoredMetadata } from "./ClientesPage";
import { prefetchPage } from "@/lib/prefetchPages";

interface SuperAdminHeaderProps {
  currentPage: string;
  onNavigate: (page: any) => void;
  onLogout?: () => void;
  userEmail?: string;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

interface SystemModuleItem {
  id: string;
  label: string;
  category: string;
  icon: any;
  page: string;
  description: string;
  keywords: string[];
}

interface SearchClientItem {
  id: string;
  nome: string;
  cnpj: string;
  cidade: string;
  ativo: boolean;
}

interface SearchAgendaItem {
  id: string;
  titulo: string;
  cliente: string;
  estudio: string;
  data: string;
  horario: string;
}

const SYSTEM_MODULES: SystemModuleItem[] = [
  {
    id: "dashboard",
    label: "Home / Resumo Geral",
    category: "Visão Geral",
    icon: Home,
    page: "dashboard",
    description: "Visão geral, MRR da agência, suporte aberto e Info Music",
    keywords: ["home", "início", "resumo", "mrr", "visão geral", "painel", "dashboard", "super admin"],
  },
  {
    id: "clientes",
    label: "Clientes & Emissoras",
    category: "Gestão Corporativa",
    icon: Building2,
    page: "clientes",
    description: "Cadastro de empresas, emissoras de rádio, CNPJ e contratos",
    keywords: ["clientes", "emissoras", "rádios", "empresas", "parceiros", "cadastro", "cnpj", "contratos"],
  },
  {
    id: "produtos",
    label: "Produtos & Pacotes",
    category: "Comercial",
    icon: Package,
    page: "produtos",
    description: "Catálogo de soluções digitais, pacotes e planos contratados",
    keywords: ["produtos", "pacotes", "planos", "catálogo", "serviços", "soluções", "vendas"],
  },
  {
    id: "housemix",
    label: "House Mix / Programação",
    category: "Produção",
    icon: Radio,
    page: "housemix",
    description: "Grade de programação, cadastro de programas, estúdios e locução",
    keywords: ["house mix", "grade", "programas", "estúdios", "rádio", "programação", "horários"],
  },
  {
    id: "programas",
    label: "Cadastro de Programas",
    category: "House Mix",
    icon: Radio,
    page: "programas",
    description: "Cadastro de programas da grade por cliente e estúdio",
    keywords: ["programas", "cadastro de programas", "grade", "estúdios", "house mix", "locutores"],
  },
  {
    id: "agenda",
    label: "Agenda & Gravações",
    category: "Produção",
    icon: CalendarDays,
    page: "agenda",
    description: "Calendário de gravações, agendamento por cliente, estúdio e programa",
    keywords: ["agenda", "eventos", "gravação", "calendário", "agendamento", "entrevistas", "estúdio", "horários", "locação"],
  },
  {
    id: "financeiro",
    label: "Gestão Financeira (MRR)",
    category: "Business",
    icon: DollarSign,
    page: "financeiro",
    description: "Receita mensal (MRR), mensalidades dos clientes, faturamento e relatórios",
    keywords: ["financeiro", "mrr", "receita mensal", "mensalidade", "fee", "faturamento", "cobrança", "boletos", "relatórios", "business"],
  },
  {
    id: "chatbot",
    label: "Atendimento & Suporte (Chatbot)",
    category: "Business",
    icon: Bot,
    page: "chatbot",
    description: "Inteligência artificial, fluxo de mensagens, atendimento automático e disparos",
    keywords: ["chatbot", "chat bott", "atendimento", "suporte", "whatsapp", "bot", "mensagens", "ia", "automação", "leads"],
  },
  {
    id: "propostas",
    label: "Orçamentos & Propostas",
    category: "Business",
    icon: FileText,
    page: "propostas",
    description: "Criação de propostas comerciais, orçamentos, cotação e exportação PDF",
    keywords: ["orçamento", "propostas", "comercial", "contratos", "cotação", "vendas", "pdf", "valores"],
  },
  {
    id: "admininfomusic",
    label: "Info Music (Base Musical)",
    category: "Base de Dados",
    icon: Music,
    page: "admininfomusic",
    description: "Base de dados musical, metadados, letras, curiosidades e histórico de músicas",
    keywords: ["info music", "músicas", "base musical", "letras", "metadados", "artistas", "cadastro", "acervo"],
  },
  {
    id: "configuracoes",
    label: "Configurações da Empresa",
    category: "Sistema",
    icon: Settings,
    page: "configuracoes",
    description: "Dados institucionais, logotipo da empresa, CNPJ, arquivos e preferências",
    keywords: ["configurações", "empresa", "cnpj", "logo", "sistema", "perfil", "dados", "arquivos", "download"],
  },
  {
    id: "sorteios",
    label: "Sorteios & Ganhadores",
    category: "Engajamento",
    icon: Gift,
    page: "sorteios",
    description: "Gestão de sorteios, roleta interativa, prêmios e cadastro de ganhadores",
    keywords: ["sorteios", "roleta", "prêmios", "ganhadores", "participantes", "engajamento"],
  },
  {
    id: "blitz",
    label: "Blitz & Flashes Ao Vivo",
    category: "Produção",
    icon: Siren,
    page: "blitz",
    description: "Flashes externos, ações de rua em tempo real com locutores",
    keywords: ["blitz", "flash", "locutor externo", "ao vivo", "rua", "transmissão externa"],
  },
  {
    id: "promocoes",
    label: "Promoções & Campanhas",
    category: "Comercial",
    icon: Tag,
    page: "promocoes",
    description: "Campanhas promocionais, cupons, banners e ações comerciais",
    keywords: ["promoções", "campanhas", "cupons", "banners", "marketing", "ações promocionais"],
  },
  {
    id: "cenario",
    label: "Cenários Virtuais / TV",
    category: "Transmissão",
    icon: MonitorPlay,
    page: "cenario",
    description: "Estúdio web, cenários virtuais, chroma key e integração visual",
    keywords: ["cenários", "tv", "chroma", "vmix", "estúdio web", "telas", "painel", "vídeo ao vivo"],
  },
  {
    id: "preroll",
    label: "ADS & Pre-roll Comercial",
    category: "Comercial",
    icon: Film,
    page: "preroll",
    description: "Vídeos e spots publicitários, exibição pre-roll e patrocinadores",
    keywords: ["ads", "pre-roll", "comercial", "vídeos", "anúncios", "publicidade", "spots"],
  },
  {
    id: "testemunhais",
    label: "Citações & Testemunhais",
    category: "Comercial",
    icon: FileText,
    page: "testemunhais",
    description: "Textos para leitura do locutor ao vivo, merchandising e citações",
    keywords: ["citações", "testemunhais", "merchandising", "leituras", "locutor ao vivo", "textos"],
  },
  {
    id: "noticias",
    label: "Roteiro de Programa / Notícias",
    category: "Conteúdo",
    icon: FileText,
    page: "noticias",
    description: "Pautas de notícias, blocos jornalísticos e roteiro de locução",
    keywords: ["roteiro", "notícias", "jornalismo", "pautas", "blocos", "noticiário"],
  },
  {
    id: "musica",
    label: "Música no Ar (XML / Player)",
    category: "Transmissão",
    icon: Music,
    page: "musica",
    description: "Sincronização de XML de músicas no ar, software de automação e player",
    keywords: ["música no ar", "xml", "player", "automação", "streaming", "músicas"],
  },
  {
    id: "apresentadores",
    label: "Participantes & Apresentadores",
    category: "Cadastros",
    icon: Mic2,
    page: "apresentadores",
    description: "Locutores, comunicadores, repórteres e convidados fixos",
    keywords: ["apresentadores", "locutores", "participantes", "equipe", "comunicadores", "convidados"],
  },
  {
    id: "ouvintes",
    label: "Ouvintes & Leads",
    category: "Cadastros",
    icon: Users,
    page: "ouvintes",
    description: "Base de ouvintes cadastrados, contatos de WhatsApp e histórico",
    keywords: ["ouvintes", "leads", "contatos", "banco de dados", "participantes"],
  },
  {
    id: "site",
    label: "Gestor do Site",
    category: "Web",
    icon: Globe,
    page: "site",
    description: "Administração do portal web, notícias e conteúdos digitais",
    keywords: ["site", "portal", "notícias do site", "web", "layout site"],
  },
];

export default function SuperAdminHeader({
  currentPage,
  onNavigate,
  onLogout,
  userEmail = "alex@nexobrasil.net",
  searchQuery = "",
  onSearchChange,
}: SuperAdminHeaderProps) {
  const [produtosOpen, setProdutosOpen] = useState(false);
  const [businessOpen, setBusinessOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | undefined>(new Date());
  const [eventDates, setEventDates] = useState<Date[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(searchQuery || "");
  const [clientsList, setClientsList] = useState<SearchClientItem[]>([]);
  const [agendaList, setAgendaList] = useState<SearchAgendaItem[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const produtosRef = useRef<HTMLDivElement>(null);
  const businessRef = useRef<HTMLDivElement>(null);
  const produtosTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const businessTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // User Profile state
  const { user, signOut } = useAuth();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [adminName, setAdminName] = useState(() => {
    try {
      const cached = localStorage.getItem("nexohub_admin_profile");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.nome) return parsed.nome;
      }
    } catch {}
    return "Alex Almeida";
  });
  const [adminAvatar, setAdminAvatar] = useState<string>(() => {
    try {
      const cached = localStorage.getItem("nexohub_admin_profile");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.avatar_url) return parsed.avatar_url;
      }
    } catch {}
    return "/avatars/usr-1.png";
  });
  const [tempName, setTempName] = useState("");
  const [tempAvatar, setTempAvatar] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chatbot inbox unread messages count for notification bell
  const [unreadChatbotCount, setUnreadChatbotCount] = useState<number>(() => {
    try {
      const local = localStorage.getItem("nexohub_chatbot_contacts_v1");
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          return parsed.reduce((sum: number, c: any) => sum + (Number(c.unread_count) || 0), 0);
        }
      }
      const cached = localStorage.getItem("nexohub_chatbot_unread_count");
      if (cached !== null) {
        return parseInt(cached, 10) || 0;
      }
    } catch {}
    return 2; // Initial 2 unread support messages
  });

  useEffect(() => {
    let mounted = true;

    async function syncUnreadChatbot() {
      try {
        const { data, error } = await supabase.from("wa_contacts").select("unread_count");
        if (!error && data && data.length > 0) {
          const total = data.reduce((sum, c: any) => sum + (Number(c.unread_count) || 0), 0);
          if (mounted) {
            setUnreadChatbotCount(total);
            localStorage.setItem("nexohub_chatbot_unread_count", String(total));
          }
          return;
        }
      } catch {}

      try {
        const local = localStorage.getItem("nexohub_chatbot_contacts_v1");
        if (local) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed)) {
            const total = parsed.reduce((sum: number, c: any) => sum + (Number(c.unread_count) || 0), 0);
            if (mounted) setUnreadChatbotCount(total);
            return;
          }
        }
        const cached = localStorage.getItem("nexohub_chatbot_unread_count");
        if (cached !== null && mounted) {
          setUnreadChatbotCount(parseInt(cached, 10) || 0);
        }
      } catch {}
    }

    syncUnreadChatbot();

    const ch = supabase
      .channel("superadmin-header-chatbot")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_contacts" },
        () => {
          syncUnreadChatbot();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_messages" },
        () => {
          syncUnreadChatbot();
        }
      )
      .subscribe();

    const handleChatbotUpdate = (e: any) => {
      if (typeof e?.detail?.unreadCount === "number") {
        setUnreadChatbotCount(e.detail.unreadCount);
      } else {
        syncUnreadChatbot();
      }
    };

    window.addEventListener("chatbot:unread_updated", handleChatbotUpdate);

    return () => {
      mounted = false;
      supabase.removeChannel(ch);
      window.removeEventListener("chatbot:unread_updated", handleChatbotUpdate);
    };
  }, []);

  // Load and sync profile
  useEffect(() => {
    const uid = user?.id;
    const isAlex = (user?.email || userEmail || "").toLowerCase().includes("alex") || uid === "admin_alex_nexo";
    const defaultAlexAvatar = "/avatars/usr-1.png";

    if (uid) {
      supabase
        .from("profiles")
        .select("nome, avatar_url")
        .eq("user_id", uid)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            if (data.nome) setAdminName(data.nome);
            const chosenAvatar = data.avatar_url || (isAlex ? defaultAlexAvatar : "");
            if (chosenAvatar) setAdminAvatar(chosenAvatar);
            try {
              localStorage.setItem(
                "nexohub_admin_profile",
                JSON.stringify({
                  nome: data.nome || "Alex Almeida",
                  avatar_url: chosenAvatar,
                })
              );
            } catch {}
          } else if (user?.user_metadata?.name || user?.user_metadata?.full_name) {
            const metaName = user.user_metadata.name || user.user_metadata.full_name;
            setAdminName(metaName);
            const chosenAvatar = user.user_metadata.avatar_url || (isAlex ? defaultAlexAvatar : "");
            if (chosenAvatar) setAdminAvatar(chosenAvatar);
          } else if (isAlex) {
            setAdminAvatar(defaultAlexAvatar);
            try {
              localStorage.setItem(
                "nexohub_admin_profile",
                JSON.stringify({
                  nome: "Alex Almeida",
                  avatar_url: defaultAlexAvatar,
                })
              );
            } catch {}
          }
        });
    } else if (isAlex) {
      setAdminAvatar(defaultAlexAvatar);
    }

    const onProfileUpdate = (e: any) => {
      const detail = e.detail;
      if (detail) {
        if (detail.nome !== undefined) setAdminName(detail.nome);
        if (detail.avatar_url !== undefined) setAdminAvatar(detail.avatar_url || (isAlex ? defaultAlexAvatar : ""));
      }
    };
    window.addEventListener("profile:updated", onProfileUpdate);
    return () => window.removeEventListener("profile:updated", onProfileUpdate);
  }, [user?.id, userEmail]);

  const handleOpenProfileModal = () => {
    setTempName(adminName || "Alex Almeida");
    setTempAvatar(adminAvatar || "/avatars/usr-1.png");
    setSelectedFile(null);
    setProfileModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione um arquivo de imagem válido.");
      return;
    }
    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setTempAvatar(objectUrl);
  };

  const handleRemovePhoto = () => {
    setSelectedFile(null);
    setTempAvatar("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSaveProfile = async () => {
    if (!tempName.trim()) {
      toast.error("O nome não pode ficar em branco.");
      return;
    }
    setSavingProfile(true);
    try {
      let finalAvatarUrl: string | null = tempAvatar;

      if (selectedFile && user?.id) {
        try {
          const compressed = await compressImage(selectedFile, 800, 800, 0.85);
          const ext = compressed.type.includes("png") ? "png" : "webp";
          const path = `avatars/${user.id}-${Date.now()}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from("empresa-assets")
            .upload(path, compressed, { upsert: true, contentType: compressed.type });

          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
            finalAvatarUrl = urlData.publicUrl;
          } else {
            console.warn("Upload falhou no bucket, usando fallback base64:", uploadErr);
            const reader = new FileReader();
            finalAvatarUrl = await new Promise((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(compressed);
            });
          }
        } catch (uploadError) {
          console.error("Erro ao processar imagem:", uploadError);
        }
      }

      const uid = user?.id;
      if (uid) {
        await supabase
          .from("profiles")
          .upsert(
            {
              user_id: uid,
              nome: tempName.trim(),
              avatar_url: finalAvatarUrl || null,
              email: user?.email || userEmail,
              updated_at: new Date().toISOString(),
            } as any,
            { onConflict: "user_id" }
          );

        try {
          await supabase.auth.updateUser({
            data: {
              name: tempName.trim(),
              full_name: tempName.trim(),
              avatar_url: finalAvatarUrl || null,
            },
          });
        } catch {}
      }

      setAdminName(tempName.trim());
      setAdminAvatar(finalAvatarUrl || "");

      try {
        localStorage.setItem(
          "nexohub_admin_profile",
          JSON.stringify({ nome: tempName.trim(), avatar_url: finalAvatarUrl || "" })
        );
      } catch {}

      window.dispatchEvent(
        new CustomEvent("profile:updated", {
          detail: { nome: tempName.trim(), avatar_url: finalAvatarUrl || "" },
        })
      );

      toast.success("Perfil atualizado com sucesso!");
      setProfileModalOpen(false);
    } catch (err: any) {
      console.error("Erro ao salvar perfil:", err);
      toast.error("Erro ao salvar perfil: " + (err.message || "Tente novamente"));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleProdutosMouseEnter = () => {
    if (produtosTimeoutRef.current) clearTimeout(produtosTimeoutRef.current);
    if (businessTimeoutRef.current) clearTimeout(businessTimeoutRef.current);
    setBusinessOpen(false);
    setProdutosOpen(true);
  };

  const handleProdutosMouseLeave = () => {
    produtosTimeoutRef.current = setTimeout(() => {
      setProdutosOpen(false);
    }, 180);
  };

  const handleBusinessMouseEnter = () => {
    if (businessTimeoutRef.current) clearTimeout(businessTimeoutRef.current);
    if (produtosTimeoutRef.current) clearTimeout(produtosTimeoutRef.current);
    setProdutosOpen(false);
    setBusinessOpen(true);
  };

  const handleBusinessMouseLeave = () => {
    businessTimeoutRef.current = setTimeout(() => {
      setBusinessOpen(false);
    }, 180);
  };

  // Load dates of registered events for dot markers
  useEffect(() => {
    async function loadEventDates() {
      try {
        const { data, error } = await supabase
          .from("agenda_eventos")
          .select("data");
        if (data && !error) {
          const dates = data
            .map(e => e.data ? new Date(e.data + "T12:00:00") : null)
            .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
          setEventDates(dates);
        }
      } catch {
        /* noop */
      }
    }
    loadEventDates();
  }, []);

  // Click outside to close submenus
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (businessRef.current && !businessRef.current.contains(event.target as Node)) {
        setBusinessOpen(false);
      }
      if (produtosRef.current && !produtosRef.current.contains(event.target as Node)) {
        setProdutosOpen(false);
      }
    }
    if (businessOpen || produtosOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [businessOpen, produtosOpen]);

  // Dynamic current date formatted like "04 de Setembro/26"
  const todayFormatted = (() => {
    try {
      const now = new Date();
      const day = format(now, "dd");
      const month = format(now, "MMMM", { locale: ptBR });
      const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);
      const year = format(now, "yy");
      return `${day} de ${capitalizedMonth}/${year}`;
    } catch {
      return "04 de Setembro/26";
    }
  })();

  // Carrega clientes para o autocomplete da busca
  useEffect(() => {
    async function loadSearchClients() {
      try {
        const storedMeta = getStoredMetadata();
        const list: SearchClientItem[] = [];
        const seen = new Set<string>();
        const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((val || "").trim());

        // 1. Clientes em storedMeta
        Object.entries(storedMeta).forEach(([key, meta]) => {
          const candidateName = (meta.razao_social || meta.nome_empresarial || (key.startsWith("local_") ? "" : key) || "").trim();
          if (!candidateName || isUuid(candidateName)) return;
          const upper = candidateName.toUpperCase();
          if (seen.has(upper)) return;
          seen.add(upper);

          list.push({
            id: key,
            nome: candidateName,
            cnpj: meta.cnpj || "",
            cidade: meta.cidade ? `${meta.cidade}${meta.estado ? `/${meta.estado}` : ""}` : "",
            ativo: meta.ativo !== false,
          });
        });

        // 2. Clientes do Supabase (logos_patrocinadores e empresa_config)
        const [logosRes, empRes] = await Promise.all([
          supabase.from("logos_patrocinadores").select("id, nome, ativo").eq("excluido", false).order("nome"),
          supabase.from("empresa_config").select("user_id, nome, ativo").order("nome")
        ]);

        (logosRes.data || []).forEach((item: any) => {
          let n = (item.nome || "").trim();
          if (!n || isUuid(n)) return;
          const up = n.toUpperCase();
          if (!seen.has(up)) {
            seen.add(up);
            list.push({
              id: item.id,
              nome: n,
              cnpj: "",
              cidade: "",
              ativo: item.ativo !== false,
            });
          }
        });

        (empRes.data || []).forEach((emp: any) => {
          let n = (emp.nome || "").trim();
          if (!n || isUuid(n)) return;
          const up = n.toUpperCase();
          if (!seen.has(up)) {
            seen.add(up);
            list.push({
              id: emp.user_id,
              nome: n,
              cnpj: "",
              cidade: "",
              ativo: emp.ativo !== false,
            });
          }
        });

        setClientsList(list);
      } catch (err) {
        console.warn("Erro ao carregar clientes para busca:", err);
      }
    }
    loadSearchClients();
  }, []);

  // Carrega eventos recentes da agenda para a busca
  useEffect(() => {
    async function loadSearchAgenda() {
      try {
        const { data } = await supabase
          .from("agenda_eventos")
          .select("id, titulo, cliente_nome, estudio_nome, programa_nome, data, horario_inicio")
          .order("data", { ascending: false })
          .limit(40);

        if (data) {
          setAgendaList(
            data.map((e: any) => ({
              id: e.id,
              titulo: e.titulo || e.programa_nome || "Evento sem título",
              cliente: e.cliente_nome || "",
              estudio: e.estudio_nome || "",
              data: e.data || "",
              horario: e.horario_inicio || "",
            }))
          );
        }
      } catch (err) {
        console.warn("Erro ao carregar agenda para busca:", err);
      }
    }
    loadSearchAgenda();
  }, []);

  // Click outside para fechar a busca
  useEffect(() => {
    function handleClickOutsideSearch(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    }
    if (searchOpen) {
      document.addEventListener("mousedown", handleClickOutsideSearch);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutsideSearch);
    };
  }, [searchOpen]);

  // Sincroniza searchQuery da prop caso seja fornecida
  useEffect(() => {
    if (searchQuery !== undefined && searchQuery !== searchTerm) {
      setSearchTerm(searchQuery);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  const handleSearchChangeInput = (val: string) => {
    setSearchTerm(val);
    onSearchChange?.(val);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    onSearchChange?.("");
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  const handleCloseSearch = () => {
    setSearchOpen(false);
    setSearchTerm("");
    onSearchChange?.("");
  };

  const handleSelectClient = (client: SearchClientItem) => {
    try {
      sessionStorage.setItem("nexohub_cliente_filter", client.nome);
      window.dispatchEvent(new CustomEvent("clientes:filter", { detail: { term: client.nome } }));
    } catch {}
    onNavigate("clientes");
    handleCloseSearch();
  };

  const handleSelectModule = (mod: SystemModuleItem) => {
    onNavigate(mod.page);
    handleCloseSearch();
  };

  const handleSelectAgenda = (item: SearchAgendaItem) => {
    onNavigate("agenda");
    handleCloseSearch();
  };

  // Filtragem
  const normQuery = searchTerm.trim().toLowerCase();

  const filteredModules = useMemo(() => {
    if (!normQuery) return SYSTEM_MODULES.slice(0, 6);
    return SYSTEM_MODULES.filter(m =>
      m.label.toLowerCase().includes(normQuery) ||
      m.category.toLowerCase().includes(normQuery) ||
      m.description.toLowerCase().includes(normQuery) ||
      m.keywords.some(k => k.toLowerCase().includes(normQuery))
    );
  }, [normQuery]);

  const filteredClients = useMemo(() => {
    if (!normQuery) return clientsList.slice(0, 5);
    const cleanNumbers = normQuery.replace(/\D/g, "");
    return clientsList.filter(c =>
      c.nome.toLowerCase().includes(normQuery) ||
      (cleanNumbers.length >= 3 && c.cnpj.replace(/\D/g, "").includes(cleanNumbers)) ||
      c.cidade.toLowerCase().includes(normQuery)
    );
  }, [normQuery, clientsList]);

  const filteredAgenda = useMemo(() => {
    if (!normQuery) return [];
    return agendaList.filter(a =>
      a.titulo.toLowerCase().includes(normQuery) ||
      a.cliente.toLowerCase().includes(normQuery) ||
      a.estudio.toLowerCase().includes(normQuery)
    ).slice(0, 4);
  }, [normQuery, agendaList]);

  const totalResults = filteredClients.length + filteredModules.length + filteredAgenda.length;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      handleCloseSearch();
    } else if (e.key === "Enter") {
      if (filteredClients.length > 0) {
        handleSelectClient(filteredClients[0]);
      } else if (filteredModules.length > 0) {
        handleSelectModule(filteredModules[0]);
      } else if (filteredAgenda.length > 0) {
        handleSelectAgenda(filteredAgenda[0]);
      }
    }
  };

  return (
    <header className="w-full pt-4 pb-2 px-4 lg:px-8 animate-fade-in font-sans relative z-50">
      <div className="max-w-[1600px] mx-auto space-y-4">
        {/* Main Navbar Card (Pure white rounded bar) */}
        <div className="bg-white rounded-full px-6 py-3.5 flex items-center justify-between shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-100/90 relative z-40">
          {/* Left: NX. Logo & Soluções Visuais */}
          <div className="flex items-center gap-8">
            <button
              onClick={() => onNavigate("dashboard")}
              className="flex items-center gap-2.5 outline-none focus:opacity-80 transition-opacity cursor-pointer group"
              title="Painel Super Admin Nexo"
            >
              <img
                src={logoNxo}
                alt="nx."
                className="h-9 w-auto object-contain"
              />
              <span className="text-black text-sm font-semibold tracking-tight select-none">
                soluções visuais
              </span>
            </button>
          </div>

          {/* Center: Navigation Links */}
          <nav className="hidden md:flex items-center gap-6">
            <button
              onClick={() => onNavigate("dashboard")}
              className={`text-sm font-semibold transition-colors px-3 py-1.5 rounded-full ${
                currentPage === "dashboard" ? "text-black font-bold" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
              }`}
            >
              home
            </button>

            <span className="h-5 w-px bg-slate-400/70 rounded-full shrink-0 select-none pointer-events-none" aria-hidden="true" />

            <button
              onClick={() => onNavigate("clientes")}
              className={`text-sm font-semibold transition-colors px-3 py-1.5 rounded-full ${
                currentPage === "clientes" ? "text-black font-bold" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
              }`}
            >
              clientes
            </button>

            <span className="h-5 w-px bg-slate-400/70 rounded-full shrink-0 select-none pointer-events-none" aria-hidden="true" />

            {/* Produtos Dropdown (Mouse over abrindo para baixo) */}
            <div
              ref={produtosRef}
              className="relative"
              onMouseEnter={handleProdutosMouseEnter}
              onMouseLeave={handleProdutosMouseLeave}
            >
              <button
                type="button"
                onClick={() => setProdutosOpen(prev => !prev)}
                className={`text-sm font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full transition-all outline-none ${
                  produtosOpen
                    ? "bg-black text-white shadow-sm"
                    : ["produtos", "housemix", "modulos", "subusuarios", "pacotes", "admininfomusic"].includes(currentPage)
                    ? "text-black font-bold bg-slate-100"
                    : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                }`}
              >
                <span>produtos</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${produtosOpen ? "rotate-180 opacity-100" : "opacity-60"}`} />
              </button>

              {produtosOpen && (
                <div className="absolute top-full left-0 pt-2 z-[9999] animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="bg-[#000000] border border-white/10 rounded-2xl p-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.35)] min-w-[170px] space-y-1">
                    <button
                      onClick={() => { onNavigate("produtos"); setProdutosOpen(false); }}
                      className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between ${
                        currentPage === "produtos"
                          ? "bg-[#0133a8] text-[#f5f4f9] font-bold"
                          : "text-white/85 hover:bg-[#0133a8] hover:text-[#f5f4f9]"
                      }`}
                    >
                      <span>cadastro</span>
                    </button>
                    <button
                      onClick={() => { onNavigate("housemix"); setProdutosOpen(false); }}
                      className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between ${
                        ["housemix", "modulos", "subusuarios", "pacotes", "admininfomusic"].includes(currentPage)
                          ? "bg-[#0133a8] text-[#f5f4f9] font-bold"
                          : "text-white/85 hover:bg-[#0133a8] hover:text-[#f5f4f9]"
                      }`}
                    >
                      <span>house mix</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <span className="h-5 w-px bg-slate-400/70 rounded-full shrink-0 select-none pointer-events-none" aria-hidden="true" />

            {/* Business Dropdown (Mouse over abrindo para baixo) */}
            <div
              ref={businessRef}
              className="relative"
              onMouseEnter={handleBusinessMouseEnter}
              onMouseLeave={handleBusinessMouseLeave}
            >
              <button
                type="button"
                onClick={() => setBusinessOpen(prev => !prev)}
                className={`text-sm font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full transition-all outline-none ${
                  businessOpen
                    ? "bg-black text-white shadow-sm"
                    : ["financeiro", "chatbot", "propostas"].includes(currentPage)
                    ? "text-black font-bold bg-slate-100"
                    : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                }`}
              >
                <span>business</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${businessOpen ? "rotate-180 opacity-100" : "opacity-60"}`} />
              </button>

              {businessOpen && (
                <div className="absolute top-full left-0 pt-2 z-[9999] animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="bg-[#000000] border border-white/10 rounded-2xl p-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.35)] min-w-[200px] space-y-1">
                    <button
                      onClick={() => { onNavigate("financeiro"); setBusinessOpen(false); }}
                      className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between ${
                        currentPage === "financeiro"
                          ? "bg-[#0133a8] text-[#f5f4f9] font-bold"
                          : "text-white/85 hover:bg-[#0133a8] hover:text-[#f5f4f9]"
                      }`}
                    >
                      <span>financeiro</span>
                    </button>
                    <button
                      onClick={() => { onNavigate("propostas"); setBusinessOpen(false); }}
                      className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between ${
                        currentPage === "propostas"
                          ? "bg-[#0133a8] text-[#f5f4f9] font-bold"
                          : "text-white/85 hover:bg-[#0133a8] hover:text-[#f5f4f9]"
                      }`}
                    >
                      <span>orçamento</span>
                    </button>
                    <button
                      onClick={() => { onNavigate("chatbot"); setBusinessOpen(false); }}
                      className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between ${
                        currentPage === "chatbot"
                          ? "bg-[#0133a8] text-[#f5f4f9] font-bold"
                          : "text-white/85 hover:bg-[#0133a8] hover:text-[#f5f4f9]"
                      }`}
                    >
                      <span>atendimento - suporte</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <span className="h-5 w-px bg-slate-400/70 rounded-full shrink-0 select-none pointer-events-none" aria-hidden="true" />

            {/* Agenda Link (ao lado de business) */}
            <button
              onClick={() => onNavigate("agenda")}
              className={`text-sm font-semibold transition-colors px-3 py-1.5 rounded-full outline-none ${
                currentPage === "agenda" ? "text-black font-bold bg-slate-100" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
              }`}
            >
              agenda
            </button>
          </nav>

          {/* Right: Notifications, Settings, User Avatar */}
          <div className="flex items-center gap-2.5">
            {/* Notification Bell Button: Aceso quando tiver mensagens no chatbot com balão em cima */}
            <button
              onClick={() => onNavigate("chatbot")}
              className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-sm cursor-pointer ${
                unreadChatbotCount > 0
                  ? "bg-blue-50/90 hover:bg-blue-100/90 border border-blue-200 text-[#0055ff] shadow-[0_0_14px_rgba(0,85,255,0.22)]"
                  : "bg-slate-50 hover:bg-slate-100 border border-slate-200/60 text-slate-400 hover:text-slate-600"
              }`}
              title={
                unreadChatbotCount > 0
                  ? `${unreadChatbotCount} nova(s) mensagem(ns) no Chatbot (Atendimento & Suporte)`
                  : "Nenhuma mensagem nova no Chatbot"
              }
            >
              <Bell
                className={`w-4 h-4 transition-all ${
                  unreadChatbotCount > 0
                    ? "fill-[#0055ff] text-[#0055ff]"
                    : "fill-none text-slate-400 stroke-[1.8]"
                }`}
              />

              {/* Balão com o número de mensagens que tem na caixa de entrada do chatbot */}
              {unreadChatbotCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full bg-[#ef4444] text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white shadow-md animate-scale-in leading-none">
                  {unreadChatbotCount > 99 ? "99+" : unreadChatbotCount}
                </span>
              )}
            </button>

            {/* Settings Gear Button */}
            <button
              onMouseEnter={() => prefetchPage("configuracoes")}
              onClick={() => onNavigate("configuracoes")}
              className="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all shadow-sm"
              title="Configurações da Empresa"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* User Avatar Button (Abre popup para editar nome e subir foto) */}
            <button
              type="button"
              onClick={handleOpenProfileModal}
              className="w-10 h-10 rounded-full bg-[#0055ff] text-white flex items-center justify-center font-bold text-sm shadow-sm overflow-hidden ring-2 ring-white hover:opacity-90 hover:scale-105 active:scale-95 transition-all cursor-pointer relative"
              title={adminName ? `${adminName} (Editar Perfil)` : "Editar Perfil"}
            >
              {adminAvatar ? (
                <img
                  src={adminAvatar}
                  alt={adminName || "Super Admin"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="select-none">
                  {(adminName || "A").charAt(0).toUpperCase()}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Date Pill & Search Row (Matches screenshot under navbar) */}
        <div className="flex items-center gap-2 px-1">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded-full px-4 py-2 flex items-center gap-2.5 text-xs text-slate-800 font-semibold select-none cursor-pointer transition-all active:scale-95 hover:bg-white/90"
                style={{
                  background: "rgba(255,255,255,0.78)",
                  backdropFilter: "blur(20px) saturate(1.8)",
                  WebkitBackdropFilter: "blur(20px) saturate(1.8)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
                  border: "1px solid rgba(255,255,255,0.6)",
                }}
                title="Abrir calendário"
              >
                <CalendarIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>{todayFormatted}</span>
                <span className="w-2 h-2 rounded-full bg-[#0055ff]" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-[284px] p-3.5 bg-white border border-slate-200/80 rounded-3xl shadow-xl text-slate-800"
            >
              <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#0055ff]/10 flex items-center justify-center text-[#0055ff]">
                    <CalendarIcon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">Calendário</h4>
                    <p className="text-[10px] text-slate-400">Eventos em azul</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCalendarOpen(false);
                    onNavigate("agenda");
                  }}
                  className="w-7 h-7 rounded-full bg-slate-100 hover:bg-[#0055ff] text-slate-500 hover:text-white flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-sm active:scale-95"
                  title="Abrir agenda completa"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="superadmin-mini-cal">
                <Calendar
                  mode="single"
                  selected={selectedCalendarDate}
                  onSelect={(date) => {
                    setSelectedCalendarDate(date);
                    if (date) {
                      setCalendarOpen(false);
                      onNavigate("agenda");
                    }
                  }}
                  locale={ptBR}
                  modifiers={{
                    hasEvent: (date) => eventDates.some((ed) => isSameDay(ed, date)),
                  }}
                  modifiersClassNames={{
                    hasEvent: "has-event-day",
                  }}
                  className="p-0 pointer-events-auto"
                  classNames={{
                    months: "w-full",
                    month: "w-full space-y-2",
                    caption: "flex justify-center pt-0 pb-1 relative items-center text-slate-800 font-bold text-xs capitalize w-full",
                    caption_label: "text-xs font-bold capitalize text-slate-800 text-center mx-auto block",
                    nav: "flex items-center",
                    nav_button: "h-6 w-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 border-0 flex items-center justify-center transition-colors absolute top-1/2 -translate-y-1/2",
                    nav_button_previous: "left-1",
                    nav_button_next: "right-1",
                    table: "w-full border-collapse",
                    head_row: "flex justify-between w-full mb-1",
                    head_cell: "text-slate-400 font-semibold text-[10px] w-8 text-center uppercase",
                    row: "flex justify-between w-full mt-1",
                    cell: "h-8 w-8 text-center text-xs p-0 relative focus-within:relative focus-within:z-20",
                    day: "h-8 w-8 rounded-full p-0 font-medium text-xs hover:bg-slate-100 text-slate-700 transition-colors flex items-center justify-center",
                    day_today: "bg-slate-200 text-slate-900 font-bold",
                    day_selected: "bg-[#0055ff] text-white font-bold hover:bg-[#0047d4]",
                  }}
                />
              </div>

              <style>{`
                .superadmin-mini-cal .rdp-caption {
                  display: flex !important;
                  justify-content: center !important;
                  align-items: center !important;
                  position: relative !important;
                  width: 100% !important;
                  text-align: center !important;
                }
                .superadmin-mini-cal .rdp-caption_label {
                  text-align: center !important;
                  margin: 0 auto !important;
                  display: block !important;
                }
                .superadmin-mini-cal .rdp-nav_button_previous {
                  position: absolute !important;
                  left: 4px !important;
                  top: 50% !important;
                  transform: translateY(-50%) !important;
                }
                .superadmin-mini-cal .rdp-nav_button_next {
                  position: absolute !important;
                  right: 4px !important;
                  top: 50% !important;
                  transform: translateY(-50%) !important;
                }
                .superadmin-mini-cal .has-event-day {
                  position: relative;
                  font-weight: 700;
                }
                .superadmin-mini-cal .has-event-day::after {
                  content: '';
                  position: absolute;
                  bottom: 2px;
                  left: 50%;
                  transform: translateX(-50%);
                  width: 4px;
                  height: 4px;
                  border-radius: 50%;
                  background-color: #0055ff;
                }
              `}</style>
            </PopoverContent>
          </Popover>

          <div ref={searchContainerRef} className="relative flex items-center">
            {searchOpen ? (
              <div className="relative flex items-center">
                <div className="flex items-center bg-white rounded-full pl-3.5 pr-2 py-1.5 border border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,0.06)] animate-in fade-in zoom-in-95 duration-150 w-72 sm:w-80 md:w-96">
                  <Search className="w-3.5 h-3.5 text-slate-400 mr-2.5 shrink-0" />
                  <input
                    ref={searchInputRef}
                    value={searchTerm}
                    onChange={e => handleSearchChangeInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Buscar clientes, módulos, serviços..."
                    className="h-7 text-xs bg-transparent outline-none w-full text-slate-800 placeholder-slate-400 font-sans"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors ml-1 shrink-0 cursor-pointer"
                      title="Limpar busca"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleCloseSearch}
                    className="text-[10px] uppercase font-bold text-slate-400 hover:text-slate-600 ml-1.5 px-1.5 py-0.5 rounded-md hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
                    title="Fechar busca (ESC)"
                  >
                    ESC
                  </button>
                </div>

                {/* Floating Search Results Dropdown */}
                <div className="absolute top-full left-0 mt-2 w-80 sm:w-96 md:w-[460px] bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.18)] border border-slate-200/90 z-[99999] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 text-slate-800 font-sans">
                  {/* Header */}
                  <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>{normQuery ? `Resultados para "${searchTerm}"` : "Acesso Rápido & Módulos"}</span>
                    {normQuery && (
                      <span className="text-[10px] text-[#0055ff] bg-blue-50 px-2.5 py-0.5 rounded-full font-bold border border-blue-100">
                        {totalResults} {totalResults === 1 ? "resultado" : "resultados"}
                      </span>
                    )}
                  </div>

                  {/* Scrollable Results */}
                  <div className="max-h-[380px] overflow-y-auto p-2 space-y-3">
                    {/* CLIENTES */}
                    {filteredClients.length > 0 && (
                      <div>
                        <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Building2 className="w-3 h-3 text-[#0055ff]" />
                          <span>Clientes ({filteredClients.length})</span>
                        </div>
                        <div className="space-y-0.5 mt-1">
                          {filteredClients.map((client) => (
                            <button
                              key={client.id}
                              type="button"
                              onClick={() => handleSelectClient(client)}
                              className="w-full text-left px-3 py-2 rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-between group cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-blue-50 text-[#0055ff] flex items-center justify-center font-bold text-[11px] shrink-0 border border-blue-100">
                                  {client.nome.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-800 truncate group-hover:text-[#0055ff] transition-colors">
                                    {client.nome}
                                  </p>
                                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                    {client.cnpj && <span>CNPJ: {client.cnpj}</span>}
                                    {client.cidade && <span>• {client.cidade}</span>}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                  client.ativo ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500"
                                }`}>
                                  {client.ativo ? "Ativo" : "Inativo"}
                                </span>
                                <ChevronRightIcon className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#0055ff] group-hover:translate-x-0.5 transition-all" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* MÓDULOS DO SISTEMA */}
                    {filteredModules.length > 0 && (
                      <div>
                        <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <Package className="w-3 h-3 text-[#0055ff]" />
                          <span>Módulos & Recursos ({filteredModules.length})</span>
                        </div>
                        <div className="space-y-0.5 mt-1">
                          {filteredModules.map((mod) => {
                            const ModIcon = mod.icon;
                            return (
                              <button
                                key={mod.id}
                                type="button"
                                onClick={() => handleSelectModule(mod)}
                                className="w-full text-left px-3 py-2 rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-between group cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-7 h-7 rounded-xl bg-slate-100 text-slate-600 group-hover:bg-[#0055ff]/10 group-hover:text-[#0055ff] flex items-center justify-center shrink-0 transition-colors">
                                    <ModIcon className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-xs font-bold text-slate-800 truncate group-hover:text-[#0055ff] transition-colors">
                                        {mod.label}
                                      </p>
                                      <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded-md">
                                        {mod.category}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 truncate">
                                      {mod.description}
                                    </p>
                                  </div>
                                </div>
                                <ChevronRightIcon className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#0055ff] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* AGENDA */}
                    {filteredAgenda.length > 0 && (
                      <div>
                        <div className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <CalendarDays className="w-3 h-3 text-[#0055ff]" />
                          <span>Agenda ({filteredAgenda.length})</span>
                        </div>
                        <div className="space-y-0.5 mt-1">
                          {filteredAgenda.map((evt) => (
                            <button
                              key={evt.id}
                              type="button"
                              onClick={() => handleSelectAgenda(evt)}
                              className="w-full text-left px-3 py-2 rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-between group cursor-pointer"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-xl bg-blue-50 text-[#0055ff] flex items-center justify-center shrink-0">
                                  <CalendarDays className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-800 truncate group-hover:text-[#0055ff] transition-colors">
                                    {evt.titulo}
                                  </p>
                                  <p className="text-[10px] text-slate-400 truncate">
                                    {evt.cliente && `${evt.cliente} • `}{evt.estudio && `${evt.estudio} • `}{evt.data} {evt.horario}
                                  </p>
                                </div>
                              </div>
                              <ChevronRightIcon className="w-3.5 h-3.5 text-slate-300 group-hover:text-[#0055ff] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* VAZIO */}
                    {totalResults === 0 && (
                      <div className="py-8 text-center px-4">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-2">
                          <Search className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-bold text-slate-700">
                          Nenhum resultado encontrado para "{searchTerm}"
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Tente buscar por clientes como "Interativa", ou módulos como "Financeiro", "Agenda", "House Mix"...
                        </p>
                        <button
                          type="button"
                          onClick={handleClearSearch}
                          className="mt-3 text-xs font-bold text-[#0055ff] hover:underline cursor-pointer"
                        >
                          Limpar busca
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Pressione <strong>ESC</strong> para fechar</span>
                    <span><strong>↵ Enter</strong> para selecionar</span>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.02)] cursor-pointer"
                title="Buscar clientes, módulos, serviços..."
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal Popup: Editar Nome e Foto de Perfil (Renderizado no body via Portal para centralizar na tela) */}
      {profileModalOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => {
            if (!savingProfile) setProfileModalOpen(false);
          }}
        >
          <div
            className="bg-white w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden animate-in zoom-in-95 duration-200 my-auto"
            onClick={(e) => e.stopPropagation()}
            style={{ fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#0055ff]/10 text-[#0055ff] flex items-center justify-center shadow-sm">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    Editar Perfil
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Atualize seu nome e foto de exibição
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !savingProfile && setProfileModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
                disabled={savingProfile}
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* Photo Upload Area */}
              <div className="flex flex-col items-center justify-center text-center">
                <div className="relative group">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-[#0055ff]/15 bg-[#0055ff] text-white flex items-center justify-center shadow-lg cursor-pointer transition-transform group-hover:scale-105 relative"
                    title="Clique para trocar a foto"
                  >
                    {tempAvatar ? (
                      <img
                        src={tempAvatar}
                        alt="Foto de perfil"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-3xl font-bold select-none">
                        {(tempName || "A").charAt(0).toUpperCase()}
                      </span>
                    )}

                    {/* Camera overlay on hover */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[10px] font-semibold transition-opacity gap-1">
                      <Camera className="w-5 h-5" />
                      <span>Trocar foto</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#0055ff] text-white flex items-center justify-center shadow-md hover:bg-[#0044cc] transition-colors border-2 border-white"
                    title="Carregar nova foto"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />

                <div className="flex items-center gap-2 mt-3.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold text-[#0055ff] hover:text-[#0044cc] hover:underline flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Subir nova imagem
                  </button>
                  {tempAvatar && (
                    <>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="text-xs font-semibold text-red-500 hover:text-red-700 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remover
                      </button>
                    </>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Formatos recomendados: JPG, PNG ou WebP
                </p>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nome Completo
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      placeholder="Seu nome completo"
                      disabled={savingProfile}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0055ff]/20 focus:border-[#0055ff] transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      E-mail de Login
                    </label>
                    <span className="text-[10px] font-bold text-[#0055ff] bg-[#0055ff]/10 px-2 py-0.5 rounded-full">
                      Super Admin
                    </span>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={user?.email || userEmail}
                      readOnly
                      disabled
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-100/70 border border-slate-200 rounded-2xl text-sm font-medium text-slate-500 cursor-not-allowed select-all"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50/70 border-t border-slate-100 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  setProfileModalOpen(false);
                  try {
                    if (onLogout) {
                      await onLogout();
                    } else {
                      await signOut();
                    }
                  } catch (e) {
                    console.error("Logout error", e);
                    localStorage.setItem("nexohub_explicit_logout", "true");
                    window.location.replace("/");
                  }
                }}
                disabled={savingProfile}
                className="text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Encerrar sessão"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sair do sistema
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProfileModalOpen(false)}
                  disabled={savingProfile}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0055ff] hover:bg-[#0044cc] active:scale-95 rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {savingProfile ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Salvar Alterações
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}
