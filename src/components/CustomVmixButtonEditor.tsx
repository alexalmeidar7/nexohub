import { useState, useEffect, createElement } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, GripVertical, Play, Loader2, X, ChevronDown, ChevronUp, Clock, Tag, Code, Copy, ClipboardPaste, Palette, Music, Radio, Tv, Mic, Volume2, Video, Zap, Star, Sparkles, Clapperboard, Megaphone, Bell, Timer, Sun, Moon, Cloud, Heart, Settings, Power, SkipForward, Pause, StopCircle, Repeat, Shuffle, Image, Type, Layers, Monitor, Disc, Eye, Lock, Unlock, Send, Download, Upload, Bookmark, Flag, Hash, Globe, Phone, Mail, MessageSquare, Calendar, Keyboard, type LucideIcon } from "lucide-react";

const BUTTON_COLORS = [
  { value: "#f59e0b", label: "Amarelo" },
  { value: "#3b82f6", label: "Azul" },
  { value: "#22c55e", label: "Verde" },
  { value: "#dc2626", label: "Vermelho" },
  { value: "#8b5cf6", label: "Roxo" },
  { value: "#ec4899", label: "Rosa" },
  { value: "#f97316", label: "Laranja" },
  { value: "#06b6d4", label: "Ciano" },
  { value: "#64748b", label: "Cinza" },
  { value: "#ffffff", label: "Branco" },
];

const ICON_KEYWORDS: [string[], LucideIcon][] = [
  [["previsão", "previsao", "weather", "clima", "meteorologia", "nuvem", "cloud", "chuva", "previsão do tempo"], Cloud],
  [["relógio", "relogio", "clock", "hora", "timer", "cronômetro", "cronometro"], Clock],
  [["music", "música", "musica", "song", "jingle", "vinheta", "canção", "cancao"], Music],
  [["radio", "fm", "frequência", "frequencia", "sintonia"], Radio],
  [["tv", "televisão", "televisao", "monitor", "tela", "display"], Tv],
  [["mic", "microfone", "voz", "voice", "locutor", "apresentador", "entrevista"], Mic],
  [["audio", "áudio", "volume", "som", "sound"], Volume2],
  [["video", "vídeo", "câmera", "camera", "gravação", "gravacao", "filmagem"], Video],
  [["play", "reproduzir", "tocar", "iniciar"], Play],
  [["pause", "pausar", "pausa"], Pause],
  [["stop", "parar", "encerrar"], StopCircle],
  [["skip", "pular", "próximo", "proximo", "avançar", "avancar"], SkipForward],
  [["repeat", "repetir", "loop", "laço"], Repeat],
  [["shuffle", "aleatório", "aleatorio", "embaralhar"], Shuffle],
  [["efeito", "effect", "fx", "flash", "raio", "zap", "transição", "transicao"], Zap],
  [["star", "estrela", "destaque", "favorito"], Star],
  [["abertura", "intro", "opening", "start", "início", "inicio"], Clapperboard],
  [["comercial", "propaganda", "ad", "anúncio", "anuncio", "patrocínio", "patrocinio"], Megaphone],
  [["alerta", "alert", "aviso", "urgente", "notificação", "notificacao"], Bell],
  [["brilho", "sparkle", "magic", "mágica", "magica", "especial"], Sparkles],
  [["sol", "sun", "dia", "claro", "luz"], Sun],
  [["lua", "moon", "noite", "escuro"], Moon],
  [["nuvem", "cloud", "clima", "weather"], Cloud],
  [["coração", "coracao", "heart", "amor", "like", "curtir"], Heart],
  [["config", "setting", "ajuste", "engrenagem", "preferência", "preferencia"], Settings],
  [["power", "ligar", "desligar", "on", "off", "energia"], Power],
  [["imagem", "image", "foto", "picture", "png", "jpg"], Image],
  [["texto", "text", "título", "titulo", "legenda", "caption", "gráfico", "grafico", "lower"], Type],
  [["layer", "camada", "overlay", "sobreposição", "sobreposicao"], Layers],
  [["preview", "visualizar", "olho", "eye", "ver"], Eye],
  [["lock", "travar", "bloquear", "cadeado"], Lock],
  [["unlock", "destravar", "desbloquear"], Unlock],
  [["enviar", "send", "disparar"], Send],
  [["download", "baixar"], Download],
  [["upload", "enviar arquivo", "subir"], Upload],
  [["bookmark", "salvar", "marcar"], Bookmark],
  [["flag", "bandeira", "sinalizar"], Flag],
  [["hash", "tag", "número", "numero", "canal"], Hash],
  [["globe", "internet", "web", "mundo", "global"], Globe],
  [["phone", "telefone", "celular", "ligar"], Phone],
  [["mail", "email", "correio", "mensagem"], Mail],
  [["chat", "conversa", "comentário", "comentario", "whatsapp"], MessageSquare],
  [["agenda", "calendar", "calendário", "calendario", "evento", "programação", "programacao", "grade"], Calendar],
  [["disco", "disc", "cd", "dvd", "vinil"], Disc],
  [["monitor", "screen", "pc", "computador"], Monitor],
];

export function getIconForName(name: string): LucideIcon {
  const lower = name.toLowerCase();
  for (const [keywords, Icon] of ICON_KEYWORDS) {
    if (keywords.some(k => lower.includes(k))) return Icon;
  }
  return Sparkles;
}

/** Biblioteca de ícones para seleção manual no modal */
export const ICON_LIBRARY: Record<string, LucideIcon> = {
  Sparkles, Star, Zap, Clapperboard, Megaphone, Bell, Timer, Clock, Calendar,
  Music, Disc, Radio, Tv, Monitor, Mic, Volume2, Video, Image, Type, Layers,
  Play, Pause, StopCircle, SkipForward, Repeat, Shuffle, Power, Settings,
  Sun, Moon, Cloud, Heart, Eye, Lock, Unlock, Send, Download, Upload,
  Bookmark, Flag, Hash, Globe, Phone, Mail, MessageSquare, Tag,
};

/** Resolve o ícone salvo, caindo no automático por palavra-chave */
export function resolveButtonIcon(iconKey?: string | null, name = ""): LucideIcon {
  if (iconKey && ICON_LIBRARY[iconKey]) return ICON_LIBRARY[iconKey];
  return getIconForName(name);
}

interface PresetCommand {
  id: string;
  fn: string;
  input?: string;
  value?: string;
  extraKey?: string;
  extraValue?: string;
  enabled?: boolean;
  /** Metadado do vínculo com a Agenda; nunca é enviado como coluna do banco. */
  agendaProgramId?: string | null;
  /** Compatibilidade temporária com botões salvos antes desta correção. */
  programa_id?: string | null;
}


interface VmixInput {
  key: string;
  number: string;
  title: string;
  type: string;
}

interface ProgramaOption {
  id: string;
  nome: string;
  estudio: string | null;
  ativo: boolean;
}

const normalizeStudioName = (value?: string | null) =>
  (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

interface Props {
  open: boolean;
  onClose: () => void;
  buttonId: string | null; // null = new button
  userId: string;
  inputs: VmixInput[];
  onRunCommands: (commands: PresetCommand[]) => Promise<void>;
  onSaved: () => void;
  inputMapping?: Record<string, { title: string; key: string }>;
  /** Estúdio selecionado — novos botões ficam vinculados a ele */
  estudio?: string | null;
}

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const PRESET_COMMANDS = [
  { value: "CutDirect", label: "CutDirect", desc: "Corta diretamente para o input", category: "Transição", params: ["input"] },
  { value: "Cut", label: "Cut", desc: "Corta para o input no Preview", category: "Transição", params: ["input"] },
  { value: "Fade", label: "Fade", desc: "Transição suave para o input", category: "Transição", params: ["input", "value"] },
  { value: "Merge", label: "Merge", desc: "Transição Merge", category: "Transição", params: ["input", "value"] },
  { value: "Wipe", label: "Wipe", desc: "Transição Wipe", category: "Transição", params: ["input", "value"] },
  { value: "Zoom", label: "Zoom", desc: "Transição Zoom", category: "Transição", params: ["input", "value"] },
  { value: "Slide", label: "Slide", desc: "Transição Slide", category: "Transição", params: ["input", "value"] },
  { value: "Stinger1", label: "Stinger1", desc: "Executa a transição Stinger 1", category: "Transição", params: ["input"] },
  { value: "Stinger2", label: "Stinger2", desc: "Executa a transição Stinger 2", category: "Transição", params: ["input"] },
  { value: "Stinger3", label: "Stinger3", desc: "Executa a transição Stinger 3", category: "Transição", params: ["input"] },
  { value: "Stinger4", label: "Stinger4", desc: "Executa a transição Stinger 4", category: "Transição", params: ["input"] },
  { value: "Stinger5", label: "Stinger5", desc: "Executa a transição Stinger 5 (vMix 29+)", category: "Transição", params: ["input"] },
  { value: "Stinger6", label: "Stinger6", desc: "Executa a transição Stinger 6 (vMix 29+)", category: "Transição", params: ["input"] },
  { value: "Stinger7", label: "Stinger7", desc: "Executa a transição Stinger 7 (vMix 29+)", category: "Transição", params: ["input"] },
  { value: "Stinger8", label: "Stinger8", desc: "Executa a transição Stinger 8 (vMix 29+)", category: "Transição", params: ["input"] },
  { value: "StingerX", label: "StingerX", desc: "Comando StingerX recebido por bloco de código", category: "Transição", params: ["input"] },
  { value: "StringerX", label: "StringerX", desc: "Compatibilidade com blocos que usam a grafia StringerX", category: "Transição", params: ["input"] },
  { value: "FadeToBlack", label: "FadeToBlack", desc: "Transição para tela preta", category: "Transição", params: [] },
  { value: "PreviewInput", label: "PreviewInput", desc: "Envia input para o Preview", category: "Input", params: ["input"] },
  { value: "SelectIndex", label: "SelectIndex", desc: "Seleciona um índice no input", category: "Input", params: ["input", "value"] },
  { value: "Play", label: "Play", desc: "Inicia/reinicia a reprodução do input", category: "Input", params: ["input"] },
  { value: "Pause", label: "Pause", desc: "Pausa a reprodução do input", category: "Input", params: ["input"] },
  { value: "Restart", label: "Restart", desc: "Reinicia a reprodução do input", category: "Input", params: ["input"] },
  { value: "NextItem", label: "NextItem", desc: "Avança para o próximo item", category: "Input", params: ["input"] },
  { value: "PreviousItem", label: "PreviousItem", desc: "Volta ao item anterior", category: "Input", params: ["input"] },
  { value: "SetPosition", label: "SetPosition", desc: "Define posição em milissegundos", category: "Input", params: ["input", "value"] },
  { value: "SetCountdown", label: "SetCountdown", desc: "Define contagem regressiva (HH:MM:SS)", category: "Input", params: ["input", "value"] },
  { value: "SetMultiViewOverlay", label: "SetMultiViewOverlay", desc: "Define overlay no MultiView", category: "Overlay", params: ["input", "value", "extra"] },
  { value: "MultiViewOverlayOn", label: "MultiViewOverlayOn", desc: "Liga overlay do MultiView (index 1-10)", category: "Overlay", params: ["input", "value"] },
  { value: "MultiViewOverlayOff", label: "MultiViewOverlayOff", desc: "Desliga overlay do MultiView (index 1-10)", category: "Overlay", params: ["input", "value"] },
  { value: "SetText", label: "SetText", desc: "Define texto em um título", category: "Título", params: ["input", "value", "extra"] },
  { value: "SetImage", label: "SetImage", desc: "Define imagem em um input", category: "Título", params: ["input", "value", "extra"] },
  { value: "OverlayInput1", label: "Overlay 1 ON", desc: "Ativa Overlay 1", category: "Overlay", params: ["input"] },
  { value: "OverlayInput1Off", label: "Overlay 1 OFF", desc: "Desativa Overlay 1", category: "Overlay", params: [] },
  { value: "OverlayInput2", label: "Overlay 2 ON", desc: "Ativa Overlay 2", category: "Overlay", params: ["input"] },
  { value: "OverlayInput2Off", label: "Overlay 2 OFF", desc: "Desativa Overlay 2", category: "Overlay", params: [] },
  { value: "OverlayInput3", label: "Overlay 3 ON", desc: "Ativa Overlay 3", category: "Overlay", params: ["input"] },
  { value: "OverlayInput3Off", label: "Overlay 3 OFF", desc: "Desativa Overlay 3", category: "Overlay", params: [] },
  { value: "OverlayInput4", label: "Overlay 4 ON", desc: "Ativa Overlay 4", category: "Overlay", params: ["input"] },
  { value: "OverlayInput4Off", label: "Overlay 4 OFF", desc: "Desativa Overlay 4", category: "Overlay", params: [] },
  { value: "OverlayInput1In", label: "Overlay 1 IN", desc: "Anima entrada do Overlay 1", category: "Overlay", params: ["input"] },
  { value: "OverlayInput1Out", label: "Overlay 1 OUT", desc: "Anima saída do Overlay 1", category: "Overlay", params: [] },
  { value: "OverlayInput2In", label: "Overlay 2 IN", desc: "Anima entrada do Overlay 2", category: "Overlay", params: ["input"] },
  { value: "OverlayInput2Out", label: "Overlay 2 OUT", desc: "Anima saída do Overlay 2", category: "Overlay", params: [] },
  { value: "OverlayInput3In", label: "Overlay 3 IN", desc: "Anima entrada do Overlay 3", category: "Overlay", params: ["input"] },
  { value: "OverlayInput3Out", label: "Overlay 3 OUT", desc: "Anima saída do Overlay 3", category: "Overlay", params: [] },
  { value: "OverlayInput4In", label: "Overlay 4 IN", desc: "Anima entrada do Overlay 4", category: "Overlay", params: ["input"] },
  { value: "OverlayInput4Out", label: "Overlay 4 OUT", desc: "Anima saída do Overlay 4", category: "Overlay", params: [] },
  { value: "AudioOn", label: "AudioOn", desc: "Liga áudio do input", category: "Áudio", params: ["input"] },
  { value: "AudioOff", label: "AudioOff", desc: "Desliga áudio do input", category: "Áudio", params: ["input"] },
  { value: "Audio", label: "Audio", desc: "Alterna mute do áudio do input", category: "Áudio", params: ["input"] },
  { value: "AudioAuto", label: "AudioAuto", desc: "Alterna áudio automático", category: "Áudio", params: ["input"] },
  { value: "AudioBusOn", label: "AudioBusOn", desc: "Ativa barramento de áudio (M, A–G)", category: "Áudio", params: ["input", "value"] },
  { value: "AudioBusOff", label: "AudioBusOff", desc: "Desativa barramento de áudio (M, A–G)", category: "Áudio", params: ["input", "value"] },
  { value: "SetVolume", label: "SetVolume", desc: "Define volume (0-100)", category: "Áudio", params: ["input", "value"] },
  { value: "StartStreaming", label: "StartStreaming", desc: "Inicia streaming (0, 1 ou 2)", category: "Streaming", params: ["value"] },
  { value: "StopStreaming", label: "StopStreaming", desc: "Para streaming (0, 1 ou 2)", category: "Streaming", params: ["value"] },
  { value: "StartExternal", label: "StartExternal", desc: "Inicia saída externa", category: "Streaming", params: [] },
  { value: "StopExternal", label: "StopExternal", desc: "Para saída externa", category: "Streaming", params: [] },
  { value: "SetDynamicValue1", label: "SetDynamicValue1", desc: "Define valor dinâmico 1", category: "Geral", params: ["value"] },
  { value: "SetDynamicValue2", label: "SetDynamicValue2", desc: "Define valor dinâmico 2", category: "Geral", params: ["value"] },
  { value: "SetDynamicValue3", label: "SetDynamicValue3", desc: "Define valor dinâmico 3", category: "Geral", params: ["value"] },
  { value: "SetDynamicValue4", label: "SetDynamicValue4", desc: "Define valor dinâmico 4", category: "Geral", params: ["value"] },
  { value: "KeyPress", label: "KeyPress", desc: "Envia tecla para janela ativa", category: "Geral", params: ["value"] },
  { value: "SendKeys", label: "SendKeys", desc: "Envia teclas para janela ativa", category: "Geral", params: ["value"] },
  { value: "StartRecording", label: "StartRecording", desc: "Inicia gravação", category: "Gravação", params: [] },
  { value: "StopRecording", label: "StopRecording", desc: "Para gravação", category: "Gravação", params: [] },
  { value: "StartPlayList", label: "StartPlayList", desc: "Inicia a playlist configurada no vMix", category: "Playlist", params: [] },
  { value: "StopPlayList", label: "StopPlayList", desc: "Para a playlist configurada no vMix", category: "Playlist", params: [] },
  { value: "ScriptStart", label: "ScriptStart", desc: "Inicia um script vMix", category: "Script", params: ["value"] },
  { value: "ScriptStop", label: "ScriptStop", desc: "Para um script vMix", category: "Script", params: ["value"] },

  { value: "PTZCreateVirtualInput", label: "PTZCreateVirtualInput", desc: "Cria um input virtual na posição atual da câmera", category: "PTZ", params: ["input"] },
  { value: "PTZFocusAuto", label: "PTZFocusAuto", desc: "Ativa foco automático", category: "PTZ", params: ["input"] },
  { value: "PTZFocusFar", label: "PTZFocusFar", desc: "Ajusta foco para longe; velocidade de 0 a 1", category: "PTZ", params: ["input","value"] },
  { value: "PTZFocusManual", label: "PTZFocusManual", desc: "Ativa foco manual", category: "PTZ", params: ["input"] },
  { value: "PTZFocusNear", label: "PTZFocusNear", desc: "Ajusta foco para perto; velocidade de 0 a 1", category: "PTZ", params: ["input","value"] },
  { value: "PTZFocusStop", label: "PTZFocusStop", desc: "Interrompe movimento de foco", category: "PTZ", params: ["input"] },
  { value: "PTZHome", label: "PTZHome", desc: "Retorna a câmera à posição inicial", category: "PTZ", params: ["input"] },
  { value: "PTZMoveDown", label: "PTZMoveDown", desc: "Move a câmera para baixo; velocidade de 0 a 1", category: "PTZ", params: ["input","value"] },
  { value: "PTZMoveDownLeft", label: "PTZMoveDownLeft", desc: "Move a câmera para baixo e esquerda; velocidade de 0 a 1", category: "PTZ", params: ["input","value"] },
  { value: "PTZMoveDownRight", label: "PTZMoveDownRight", desc: "Move a câmera para baixo e direita; velocidade de 0 a 1", category: "PTZ", params: ["input","value"] },
  { value: "PTZMoveLeft", label: "PTZMoveLeft", desc: "Move a câmera para a esquerda; velocidade de 0 a 1", category: "PTZ", params: ["input","value"] },
  { value: "PTZMoveRight", label: "PTZMoveRight", desc: "Move a câmera para a direita; velocidade de 0 a 1", category: "PTZ", params: ["input","value"] },
  { value: "PTZMoveStop", label: "PTZMoveStop", desc: "Interrompe todos os movimentos PTZ", category: "PTZ", params: ["input"] },
  { value: "PTZMoveToVirtualInputPosition", label: "PTZMoveToVirtualInputPosition", desc: "Move para a posição do input virtual sem colocá-lo no Preview", category: "PTZ", params: ["input"] },
  { value: "PTZMoveToVirtualInputPositionByIndex", label: "PTZMoveToVirtualInputPositionByIndex", desc: "Move para posição do input virtual pelo índice (0 a 100)", category: "PTZ", params: ["input","value"] },
  { value: "PTZMoveUp", label: "PTZMoveUp", desc: "Move a câmera para cima; velocidade de 0 a 1", category: "PTZ", params: ["input","value"] },
  { value: "PTZMoveUpLeft", label: "PTZMoveUpLeft", desc: "Move a câmera para cima e esquerda; velocidade de 0 a 1", category: "PTZ", params: ["input","value"] },
  { value: "PTZMoveUpRight", label: "PTZMoveUpRight", desc: "Move a câmera para cima e direita; velocidade de 0 a 1", category: "PTZ", params: ["input","value"] },
  { value: "PTZUpdateVirtualInput", label: "PTZUpdateVirtualInput", desc: "Atualiza o input virtual com a posição atual da câmera", category: "PTZ", params: ["input"] },
  { value: "PTZZoomIn", label: "PTZZoomIn", desc: "Aproxima o zoom; velocidade de 0 a 1", category: "PTZ", params: ["input","value"] },
  { value: "PTZZoomOut", label: "PTZZoomOut", desc: "Afasta o zoom; velocidade de 0 a 1", category: "PTZ", params: ["input","value"] },
  { value: "PTZZoomStop", label: "PTZZoomStop", desc: "Interrompe o zoom", category: "PTZ", params: ["input"] },
  { value: "AudioAutoOn", label: "AudioAutoOn", desc: "Ativa áudio automático do input", category: "Áudio", params: ["input"] },
  { value: "AudioAutoOff", label: "AudioAutoOff", desc: "Desativa áudio automático do input", category: "Áudio", params: ["input"] },
  { value: "AudioChannelMatrixApplyPreset", label: "AudioChannelMatrixApplyPreset", desc: "Aplica preset da matriz de canais de áudio; informe o nome do preset", category: "Áudio", params: ["input","value"] },
  { value: "AudioPluginOn", label: "AudioPluginOn", desc: "Ativa plugin de áudio (número do plugin a partir de 1)", category: "Áudio", params: ["input","value"] },
  { value: "AudioPluginOff", label: "AudioPluginOff", desc: "Desativa plugin de áudio (número do plugin a partir de 1)", category: "Áudio", params: ["input","value"] },
  { value: "AudioPluginOnOff", label: "AudioPluginOnOff", desc: "Alterna plugin de áudio (número do plugin a partir de 1)", category: "Áudio", params: ["input","value"] },
  { value: "AudioPluginShow", label: "AudioPluginShow", desc: "Abre editor do plugin de áudio (número a partir de 1)", category: "Áudio", params: ["input","value"] },
  { value: "SetBalance", label: "SetBalance", desc: "Define balanço estéreo de -1 a 1", category: "Áudio", params: ["input","value"] },
  { value: "SetGain", label: "SetGain", desc: "Define ganho em dB de 0 a 24", category: "Áudio", params: ["input","value"] },
  { value: "SetGainChannel1", label: "SetGainChannel1", desc: "Define ganho do canal 1 em dB de 0 a 24", category: "Áudio", params: ["input","value"] },
  { value: "SetGainChannel2", label: "SetGainChannel2", desc: "Define ganho do canal 2 em dB de 0 a 24", category: "Áudio", params: ["input","value"] },
  { value: "SetMasterVolume", label: "SetMasterVolume", desc: "Define volume master de 0 a 100", category: "Áudio", params: ["value"] },
  { value: "SetMasterVolumeFade", label: "SetMasterVolumeFade", desc: "Define volume master gradualmente; Value = volume 0–100, extra = duração em ms", category: "Áudio", params: ["value","extra"] },
  { value: "SetVolumeFade", label: "SetVolumeFade", desc: "Define volume do input gradualmente; Value = volume 0–100, extra = duração em ms", category: "Áudio", params: ["input","value","extra"] },
  { value: "Solo", label: "Solo", desc: "Alterna solo do input", category: "Áudio", params: ["input"] },
  { value: "SoloOn", label: "SoloOn", desc: "Ativa solo do input", category: "Áudio", params: ["input"] },
  { value: "SoloOff", label: "SoloOff", desc: "Desativa solo do input", category: "Áudio", params: ["input"] },
  { value: "SoloAllOff", label: "SoloAllOff", desc: "Desativa solo de todos os inputs e barramentos", category: "Áudio", params: [] },
  { value: "QuickPlay", label: "QuickPlay", desc: "Reproduz o input com transição", category: "Transição", params: ["input"] },
  { value: "SetFader", label: "SetFader", desc: "Define T-Bar de 0 a 255 (255 corta para Preview)", category: "Transição", params: ["value"] },
  { value: "SetTransitionDuration1", label: "SetTransitionDuration1", desc: "Define duração da transição do botão 1 em milissegundos", category: "Transição", params: ["value"] },
  { value: "SetTransitionDuration2", label: "SetTransitionDuration2", desc: "Define duração da transição do botão 2 em milissegundos", category: "Transição", params: ["value"] },
  { value: "SetTransitionDuration3", label: "SetTransitionDuration3", desc: "Define duração da transição do botão 3 em milissegundos", category: "Transição", params: ["value"] },
  { value: "SetTransitionDuration4", label: "SetTransitionDuration4", desc: "Define duração da transição do botão 4 em milissegundos", category: "Transição", params: ["value"] },
  { value: "SetTransitionEffect1", label: "SetTransitionEffect1", desc: "Define efeito do botão de transição 1", category: "Transição", params: ["value"] },
  { value: "SetTransitionEffect2", label: "SetTransitionEffect2", desc: "Define efeito do botão de transição 2", category: "Transição", params: ["value"] },
  { value: "SetTransitionEffect3", label: "SetTransitionEffect3", desc: "Define efeito do botão de transição 3", category: "Transição", params: ["value"] },
  { value: "SetTransitionEffect4", label: "SetTransitionEffect4", desc: "Define efeito do botão de transição 4", category: "Transição", params: ["value"] },
  { value: "Transition1", label: "Transition1", desc: "Aciona o botão de transição 1", category: "Transição", params: [] },
  { value: "Transition2", label: "Transition2", desc: "Aciona o botão de transição 2", category: "Transição", params: [] },
  { value: "Transition3", label: "Transition3", desc: "Aciona o botão de transição 3", category: "Transição", params: [] },
  { value: "Transition4", label: "Transition4", desc: "Aciona o botão de transição 4", category: "Transição", params: [] },
  { value: "FullscreenOn", label: "FullscreenOn", desc: "Ativa saída em tela cheia", category: "Saída", params: [] },
  { value: "FullscreenOff", label: "FullscreenOff", desc: "Desativa saída em tela cheia", category: "Saída", params: [] },
  { value: "SetOutput2", label: "SetOutput2", desc: "Define conteúdo da saída 2; Value = Output/Preview/MultiView/Replay/Mix/Input", category: "Saída", params: ["input","value","extra"] },
  { value: "SetOutput3", label: "SetOutput3", desc: "Define conteúdo da saída 3; Value = Output/Preview/MultiView/Replay/Mix/Input", category: "Saída", params: ["input","value","extra"] },
  { value: "SetOutput4", label: "SetOutput4", desc: "Define conteúdo da saída 4; Value = Output/Preview/MultiView/Replay/Mix/Input", category: "Saída", params: ["input","value","extra"] },
  { value: "SetOutputFullscreen", label: "SetOutputFullscreen", desc: "Define conteúdo da saída Fullscreen", category: "Saída", params: ["input","value","extra"] },
  { value: "Snapshot", label: "Snapshot", desc: "Salva captura da saída; Value = caminho/nome do arquivo opcional", category: "Gravação", params: ["value"] },
  { value: "SnapshotInput", label: "SnapshotInput", desc: "Salva captura do input selecionado; Value = caminho/nome do arquivo opcional", category: "Gravação", params: ["input","value"] },
  { value: "StartMultiCorder", label: "StartMultiCorder", desc: "Inicia MultiCorder", category: "Gravação", params: [] },
  { value: "StopMultiCorder", label: "StopMultiCorder", desc: "Para MultiCorder", category: "Gravação", params: [] },
  { value: "StartSRTOutput", label: "StartSRTOutput", desc: "Inicia saída SRT; Value opcional = número da saída a partir de 0", category: "Streaming", params: ["value"] },
  { value: "StopSRTOutput", label: "StopSRTOutput", desc: "Para saída SRT; Value opcional = número da saída a partir de 0", category: "Streaming", params: ["value"] },
  { value: "StartStopSRTOutput", label: "StartStopSRTOutput", desc: "Alterna saída SRT; Value opcional = número da saída a partir de 0", category: "Streaming", params: ["value"] },
  { value: "StartStopStreaming", label: "StartStopStreaming", desc: "Alterna streaming; Value opcional = número do stream a partir de 0", category: "Streaming", params: ["value"] },
  { value: "StreamingSetURL", label: "StreamingSetURL", desc: "Define URL RTMP; Value = número do stream opcional, seguido por vírgula e URL", category: "Streaming", params: ["value"] },
  { value: "StreamingSetKey", label: "StreamingSetKey", desc: "Define chave RTMP; Value = número do stream opcional, seguido por vírgula e chave", category: "Streaming", params: ["value"] },
  { value: "StreamingSetUsername", label: "StreamingSetUsername", desc: "Define usuário RTMP; Value = número do stream opcional, seguido por vírgula e usuário", category: "Streaming", params: ["value"] },
  { value: "StreamingSetPassword", label: "StreamingSetPassword", desc: "Define senha RTMP; Value = número do stream opcional, seguido por vírgula e senha", category: "Streaming", params: ["value"] },
  { value: "WriteDurationToRecordingLog", label: "WriteDurationToRecordingLog", desc: "Registra duração atual no log, com texto opcional em Value", category: "Gravação", params: ["value"] },
  { value: "AdjustCountdown", label: "AdjustCountdown", desc: "Adiciona/subtrai segundos à contagem regressiva", category: "Título", params: ["input","value"] },
  { value: "ChangeCountdown", label: "ChangeCountdown", desc: "Define contagem regressiva em HH:MM:SS", category: "Título", params: ["input","value"] },
  { value: "PauseCountdown", label: "PauseCountdown", desc: "Pausa/retoma contagem; se finalizada, reinicia", category: "Título", params: ["input"] },
  { value: "PauseRender", label: "PauseRender", desc: "Congela renderização do título durante atualizações", category: "Título", params: ["input"] },
  { value: "ResumeRender", label: "ResumeRender", desc: "Retoma renderização do título", category: "Título", params: ["input"] },
  { value: "SelectTitlePreset", label: "SelectTitlePreset", desc: "Seleciona preset de título pelo índice", category: "Título", params: ["input","value"] },
  { value: "SetColor", label: "SetColor", desc: "Define cor do objeto do título em formato HTML #xxxxxxxx", category: "Título", params: ["input","value","extra"] },
  { value: "SetTextColour", label: "SetTextColour", desc: "Define cor do texto em HTML #xxxxxx", category: "Título", params: ["input","value","extra"] },
  { value: "SetTextVisible", label: "SetTextVisible", desc: "Alterna visibilidade do campo de texto", category: "Título", params: ["input","extra"] },
  { value: "SetTextVisibleOn", label: "SetTextVisibleOn", desc: "Exibe campo de texto do título", category: "Título", params: ["input","extra"] },
  { value: "SetTextVisibleOff", label: "SetTextVisibleOff", desc: "Oculta campo de texto do título", category: "Título", params: ["input","extra"] },
  { value: "SetImageVisible", label: "SetImageVisible", desc: "Alterna visibilidade da imagem do título", category: "Título", params: ["input","extra"] },
  { value: "SetImageVisibleOn", label: "SetImageVisibleOn", desc: "Exibe imagem do título", category: "Título", params: ["input","extra"] },
  { value: "SetImageVisibleOff", label: "SetImageVisibleOff", desc: "Oculta imagem do título", category: "Título", params: ["input","extra"] },
  { value: "SetTickerSpeed", label: "SetTickerSpeed", desc: "Define velocidade do ticker de 0 a 1000", category: "Título", params: ["input","value","extra"] },
  { value: "StartCountdown", label: "StartCountdown", desc: "Inicia contagem regressiva", category: "Título", params: ["input"] },
  { value: "StopCountdown", label: "StopCountdown", desc: "Para e reinicia a contagem regressiva", category: "Título", params: ["input"] },
  { value: "SuspendCountdown", label: "SuspendCountdown", desc: "Pausa a contagem regressiva", category: "Título", params: ["input"] },
  { value: "TitleBeginAnimation", label: "TitleBeginAnimation", desc: "Inicia animação de página do título; Value = animação", category: "Título", params: ["input","value"] },
  { value: "AutoPauseOn", label: "AutoPauseOn", desc: "Ativa pausa automática do input", category: "Input", params: ["input"] },
  { value: "AutoPauseOff", label: "AutoPauseOff", desc: "Desativa pausa automática do input", category: "Input", params: ["input"] },
  { value: "AutoPlayFirst", label: "AutoPlayFirst", desc: "Alterna reprodução automática do primeiro item com transição", category: "Input", params: ["input"] },
  { value: "AutoPlayFirstOn", label: "AutoPlayFirstOn", desc: "Ativa reprodução automática do primeiro item com transição", category: "Input", params: ["input"] },
  { value: "AutoPlayFirstOff", label: "AutoPlayFirstOff", desc: "Desativa reprodução automática do primeiro item com transição", category: "Input", params: ["input"] },
  { value: "AutoPlayNext", label: "AutoPlayNext", desc: "Alterna reprodução automática do próximo item", category: "Input", params: ["input"] },
  { value: "AutoPlayNextOn", label: "AutoPlayNextOn", desc: "Ativa reprodução automática do próximo item", category: "Input", params: ["input"] },
  { value: "AutoPlayNextOff", label: "AutoPlayNextOff", desc: "Desativa reprodução automática do próximo item", category: "Input", params: ["input"] },
  { value: "AutoPlayOn", label: "AutoPlayOn", desc: "Ativa reprodução automática do input", category: "Input", params: ["input"] },
  { value: "AutoPlayOff", label: "AutoPlayOff", desc: "Desativa reprodução automática do input", category: "Input", params: ["input"] },
  { value: "AutoRestartOn", label: "AutoRestartOn", desc: "Ativa reinício automático do input", category: "Input", params: ["input"] },
  { value: "AutoRestartOff", label: "AutoRestartOff", desc: "Desativa reinício automático do input", category: "Input", params: ["input"] },
  { value: "ColourCorrectionAuto", label: "ColourCorrectionAuto", desc: "Executa correção automática de cor", category: "Input", params: ["input"] },
  { value: "ColourCorrectionReset", label: "ColourCorrectionReset", desc: "Restaura correção de cor padrão", category: "Input", params: ["input"] },
  { value: "CreateVirtualInput", label: "CreateVirtualInput", desc: "Cria input virtual a partir do input selecionado", category: "Input", params: ["input"] },
  { value: "DeinterlaceOn", label: "DeinterlaceOn", desc: "Ativa desentrelaçamento do input", category: "Input", params: ["input"] },
  { value: "DeinterlaceOff", label: "DeinterlaceOff", desc: "Desativa desentrelaçamento do input", category: "Input", params: ["input"] },
  { value: "Effect1", label: "Effect1", desc: "Alterna efeito 1", category: "Efeitos", params: ["input"] },
  { value: "Effect1On", label: "Effect1On", desc: "Ativa efeito 1", category: "Efeitos", params: ["input"] },
  { value: "Effect1Off", label: "Effect1Off", desc: "Desativa efeito 1", category: "Efeitos", params: ["input"] },
  { value: "Effect2", label: "Effect2", desc: "Alterna efeito 2", category: "Efeitos", params: ["input"] },
  { value: "Effect2On", label: "Effect2On", desc: "Ativa efeito 2", category: "Efeitos", params: ["input"] },
  { value: "Effect2Off", label: "Effect2Off", desc: "Desativa efeito 2", category: "Efeitos", params: ["input"] },
  { value: "Effect3", label: "Effect3", desc: "Alterna efeito 3", category: "Efeitos", params: ["input"] },
  { value: "Effect3On", label: "Effect3On", desc: "Ativa efeito 3", category: "Efeitos", params: ["input"] },
  { value: "Effect3Off", label: "Effect3Off", desc: "Desativa efeito 3", category: "Efeitos", params: ["input"] },
  { value: "Effect4", label: "Effect4", desc: "Alterna efeito 4", category: "Efeitos", params: ["input"] },
  { value: "Effect4On", label: "Effect4On", desc: "Ativa efeito 4", category: "Efeitos", params: ["input"] },
  { value: "Effect4Off", label: "Effect4Off", desc: "Desativa efeito 4", category: "Efeitos", params: ["input"] },
  { value: "InputPreviewShow", label: "InputPreviewShow", desc: "Mostra preview grande do input", category: "Input", params: ["input"] },
  { value: "InputPreviewHide", label: "InputPreviewHide", desc: "Oculta preview grande do input", category: "Input", params: ["input"] },
  { value: "InputPreviewShowHide", label: "InputPreviewShowHide", desc: "Alterna preview grande do input", category: "Input", params: ["input"] },
  { value: "LayerOn", label: "LayerOn", desc: "Ativa layer pelo índice (começando em 1)", category: "Input", params: ["input","value"] },
  { value: "LayerOff", label: "LayerOff", desc: "Desativa layer pelo índice (começando em 1)", category: "Input", params: ["input","value"] },
  { value: "LayerOnOff", label: "LayerOnOff", desc: "Alterna layer pelo índice (começando em 1)", category: "Input", params: ["input","value"] },
  { value: "ListAdd", label: "ListAdd", desc: "Adiciona arquivo à lista; Value = caminho do arquivo", category: "Input", params: ["input","value"] },
  { value: "ListExport", label: "ListExport", desc: "Exporta lista para arquivo M3U; Value = caminho", category: "Input", params: ["input","value"] },
  { value: "ListRemove", label: "ListRemove", desc: "Remove item da lista pelo índice começando em 1", category: "Input", params: ["input","value"] },
  { value: "ListRemoveAll", label: "ListRemoveAll", desc: "Remove todos os itens da lista", category: "Input", params: ["input"] },
  { value: "ListShowHide", label: "ListShowHide", desc: "Alterna exibição da lista", category: "Input", params: ["input"] },
  { value: "ListShuffle", label: "ListShuffle", desc: "Embaralha a lista", category: "Input", params: ["input"] },
  { value: "LivePlayPause", label: "LivePlayPause", desc: "Alterna reprodução/pausa de input ao vivo", category: "Input", params: ["input"] },
  { value: "LoopOn", label: "LoopOn", desc: "Ativa loop do input", category: "Input", params: ["input"] },
  { value: "LoopOff", label: "LoopOff", desc: "Desativa loop do input", category: "Input", params: ["input"] },
  { value: "MarkIn", label: "MarkIn", desc: "Define ponto de entrada", category: "Input", params: ["input"] },
  { value: "MarkOut", label: "MarkOut", desc: "Define ponto de saída", category: "Input", params: ["input"] },
  { value: "MarkReset", label: "MarkReset", desc: "Limpa pontos In/Out", category: "Input", params: ["input"] },
  { value: "MarkResetIn", label: "MarkResetIn", desc: "Limpa ponto In", category: "Input", params: ["input"] },
  { value: "MarkResetOut", label: "MarkResetOut", desc: "Limpa ponto Out", category: "Input", params: ["input"] },
  { value: "MirrorOn", label: "MirrorOn", desc: "Ativa espelhamento do input", category: "Input", params: ["input"] },
  { value: "MirrorOff", label: "MirrorOff", desc: "Desativa espelhamento do input", category: "Input", params: ["input"] },
  { value: "MoveInput", label: "MoveInput", desc: "Move input para a posição numérica indicada", category: "Input", params: ["input","value"] },
  { value: "MoveLayer", label: "MoveLayer", desc: "Move layer; Value = índice origem, índice destino", category: "Input", params: ["input","value","extra"] },
  { value: "NextPicture", label: "NextPicture", desc: "Avança foto/slide em input de fotos ou PowerPoint", category: "Input", params: ["input"] },
  { value: "PreviousPicture", label: "PreviousPicture", desc: "Volta foto/slide em input de fotos ou PowerPoint", category: "Input", params: ["input"] },
  { value: "PreviewInputNext", label: "PreviewInputNext", desc: "Envia próximo input ao Preview", category: "Input", params: [] },
  { value: "PreviewInputPrevious", label: "PreviewInputPrevious", desc: "Envia input anterior ao Preview", category: "Input", params: [] },
  { value: "RemoveInput", label: "RemoveInput", desc: "Remove input selecionado", category: "Input", params: ["input"] },
  { value: "ResetInput", label: "ResetInput", desc: "Reinicia/resetta input selecionado", category: "Input", params: ["input"] },
  { value: "SaveVideoDelay", label: "SaveVideoDelay", desc: "Salva trecho de Video Delay; Duration em ms (campo extra)", category: "Input", params: ["input","value","extra"] },
  { value: "SelectCategory", label: "SelectCategory", desc: "Seleciona categoria por nome (All, Red, Green, Blue etc.)", category: "Input", params: ["value"] },
  { value: "SetAlpha", label: "SetAlpha", desc: "Define transparência do input de 0 (transparente) a 255 (opaco)", category: "Input", params: ["input","value"] },
  { value: "SetCCGainB", label: "SetCCGainB", desc: "Define ganho azul de 0 a 2 (1 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCGainG", label: "SetCCGainG", desc: "Define ganho verde de 0 a 2 (1 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCGainR", label: "SetCCGainR", desc: "Define ganho vermelho de 0 a 2 (1 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCGainRGB", label: "SetCCGainRGB", desc: "Define ganho RGB de 0 a 2 (1 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCGainY", label: "SetCCGainY", desc: "Define ganho Y de 0 a 2 (1 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCGammaB", label: "SetCCGammaB", desc: "Define gamma azul de -1 a 1 (0 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCGammaG", label: "SetCCGammaG", desc: "Define gamma verde de -1 a 1 (0 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCGammaR", label: "SetCCGammaR", desc: "Define gamma vermelho de -1 a 1 (0 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCGammaRGB", label: "SetCCGammaRGB", desc: "Define gamma RGB de -1 a 1 (0 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCGammaY", label: "SetCCGammaY", desc: "Define gamma Y de -1 a 1 (0 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCHue", label: "SetCCHue", desc: "Define matiz de -1 a 1 (0 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCLiftB", label: "SetCCLiftB", desc: "Define lift azul de -1 a 1 (0 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCLiftG", label: "SetCCLiftG", desc: "Define lift verde de -1 a 1 (0 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCLiftR", label: "SetCCLiftR", desc: "Define lift vermelho de -1 a 1 (0 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCLiftRGB", label: "SetCCLiftRGB", desc: "Define lift RGB de -1 a 1 (0 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCLiftY", label: "SetCCLiftY", desc: "Define lift Y de -1 a 1 (0 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCSaturation", label: "SetCCSaturation", desc: "Define saturação de -1 a 1 (0 = original)", category: "Cor", params: ["input","value"] },
  { value: "SetCCTemperature", label: "SetCCTemperature", desc: "Define temperatura de cor", category: "Cor", params: ["input","value"] },
  { value: "SetCCTint", label: "SetCCTint", desc: "Define tint de cor", category: "Cor", params: ["input","value"] },
  { value: "NDICommand", label: "NDICommand", desc: "Envia comando para fonte NDI; Value = comando", category: "NDI", params: ["input","value"] },
  { value: "NDISelectSourceByIndex", label: "NDISelectSourceByIndex", desc: "Seleciona fonte NDI pelo índice de 0 a 100", category: "NDI", params: ["input","value"] },
  { value: "NDISelectSourceByName", label: "NDISelectSourceByName", desc: "Seleciona fonte NDI pelo nome", category: "NDI", params: ["input","value"] },
  { value: "NDIStartRecording", label: "NDIStartRecording", desc: "Inicia gravação da fonte NDI", category: "NDI", params: ["input"] },
  { value: "NDIStopRecording", label: "NDIStopRecording", desc: "Para gravação da fonte NDI", category: "NDI", params: ["input"] },
  { value: "BrowserBack", label: "BrowserBack", desc: "Volta página do input Browser", category: "Browser", params: ["input"] },
  { value: "BrowserForward", label: "BrowserForward", desc: "Avança página do input Browser", category: "Browser", params: ["input"] },
  { value: "BrowserNavigate", label: "BrowserNavigate", desc: "Navega para URL; Value = URL", category: "Browser", params: ["input","value"] },
  { value: "BrowserReload", label: "BrowserReload", desc: "Recarrega o input Browser", category: "Browser", params: ["input"] },
  { value: "BrowserKeyboardEnabled", label: "BrowserKeyboardEnabled", desc: "Ativa teclado no input Browser", category: "Browser", params: ["input"] },
  { value: "BrowserKeyboardDisabled", label: "BrowserKeyboardDisabled", desc: "Desativa teclado no input Browser", category: "Browser", params: ["input"] },
  { value: "BrowserMouseEnabled", label: "BrowserMouseEnabled", desc: "Ativa mouse no input Browser", category: "Browser", params: ["input"] },
  { value: "BrowserMouseDisabled", label: "BrowserMouseDisabled", desc: "Desativa mouse no input Browser", category: "Browser", params: ["input"] },
  { value: "DataSourceNextRow", label: "DataSourceNextRow", desc: "Avança linha da fonte de dados; Value = nome[,tabela]", category: "Dados", params: ["value"] },
  { value: "DataSourcePreviousRow", label: "DataSourcePreviousRow", desc: "Volta linha da fonte de dados; Value = nome[,tabela]", category: "Dados", params: ["value"] },
  { value: "DataSourceSelectRow", label: "DataSourceSelectRow", desc: "Seleciona linha; Value = fonte,tabela opcional,índice começando em 0", category: "Dados", params: ["value"] },
  { value: "DataSourcePlay", label: "DataSourcePlay", desc: "Inicia fonte de dados; Value = nome", category: "Dados", params: ["value"] },
  { value: "DataSourcePause", label: "DataSourcePause", desc: "Pausa fonte de dados; Value = nome", category: "Dados", params: ["value"] },
  { value: "DataSourceAutoNextOn", label: "DataSourceAutoNextOn", desc: "Ativa avanço automático de fonte/tabela", category: "Dados", params: ["value"] },
  { value: "DataSourceAutoNextOff", label: "DataSourceAutoNextOff", desc: "Desativa avanço automático de fonte/tabela", category: "Dados", params: ["value"] },
  { value: "DataSourceAutoNextOnOff", label: "DataSourceAutoNextOnOff", desc: "Alterna avanço automático de fonte/tabela", category: "Dados", params: ["value"] },
  { value: "LastPreset", label: "LastPreset", desc: "Carrega o último preset", category: "Preset", params: [] },
  { value: "OpenPreset", label: "OpenPreset", desc: "Carrega preset por caminho do arquivo", category: "Preset", params: ["value"] },
  { value: "SavePreset", label: "SavePreset", desc: "Salva preset no caminho informado", category: "Preset", params: ["value"] },
  { value: "Undo", label: "Undo", desc: "Desfaz fechamento de input", category: "Geral", params: [] },
  { value: "ActivatorRefresh", label: "ActivatorRefresh", desc: "Atualiza luzes e controles de dispositivos activator", category: "Geral", params: [] },
];

const CATEGORIES = [...new Set(PRESET_COMMANDS.map(c => c.category))];

function getCommandDef(fn: string) {
  return PRESET_COMMANDS.find(c => c.value === fn);
}

function getExtraLabel(fn: string): { keyLabel: string; valueLabel: string } {
  if (fn === "SetMultiViewOverlay") return { keyLabel: "Index", valueLabel: "InputOverlay" };
  if (fn === "SetText") return { keyLabel: "Index", valueLabel: "Texto" };
  if (fn === "SetImage") return { keyLabel: "Index", valueLabel: "Caminho da imagem" };
  return { keyLabel: "Extra Key", valueLabel: "Extra Value" };
}

function getStoredProgramaId(commands: unknown): string {
  if (!Array.isArray(commands)) return "";
  const commandWithProgram = commands.find((command: any) =>
    (typeof command?.agendaProgramId === "string" && command.agendaProgramId) ||
    (typeof command?.programa_id === "string" && command.programa_id),
  );
  return commandWithProgram?.agendaProgramId || commandWithProgram?.programa_id || "";
}

function formatCommandPreview(cmd: PresetCommand, inputs: VmixInput[], inputMapping?: Record<string, { title: string; key: string }>): string {
  let inputLabel = "";
  if (cmd.input) {
    const directMatch = inputs.find(i => i.key === cmd.input);
    if (directMatch) {
      inputLabel = directMatch.title;
    } else if (inputMapping && inputMapping[cmd.input]) {
      inputLabel = `${inputMapping[cmd.input].title} (não encontrado)`;
    } else {
      inputLabel = cmd.input;
    }
  }

  let line = cmd.fn;
  if (cmd.input) line += `(${inputLabel}`;
  if (cmd.value) line += `, ${cmd.value}`;
  if (cmd.extraValue) line += `, ${cmd.extraValue}`;
  if (cmd.input) line += ")";
  return line;
}

export default function CustomVmixButtonEditor({ open, onClose, buttonId, userId, inputs, onRunCommands, onSaved, inputMapping, estudio }: Props) {
  const { toast } = useToast();
  const [nome, setNome] = useState("");
  const [color, setColor] = useState("#0756C9");
  const DEFAULT_BUTTON_CATEGORIES = ["AUDIO", "CAMERAS", "EFEITOS"];
  const [buttonCategory, setButtonCategory] = useState("");
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const PRESET_BUTTON_COLORS = [
    { value: "#BFFF00", label: "Verde-limão" },
    { value: "#FF6900", label: "Laranja" },
    { value: "#F000F5", label: "Magenta" },
    { value: "#4B00FF", label: "Roxo" },
  ];
  const [customColorMode, setCustomColorMode] = useState(false);
  const [customColorPickerOpen, setCustomColorPickerOpen] = useState(false);
  const [diasSemana, setDiasSemana] = useState<string[]>([]);
  const [dataEspecifica, setDataEspecifica] = useState("");
  const [horario, setHorario] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [iconKey, setIconKey] = useState("");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [programaId, setProgramaId] = useState("");
  const [programasPodcast, setProgramasPodcast] = useState<ProgramaOption[]>([]);
  const [commands, setCommands] = useState<PresetCommand[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [pasteValue, setPasteValue] = useState("");

  const isPodcastStudio = normalizeStudioName(estudio).includes("podcast");

  useEffect(() => {
    if (!open || !isPodcastStudio) {
      setProgramasPodcast([]);
      return;
    }

    (supabase.from("programas") as any)
      .select("id, nome, estudio, ativo")
      .eq("user_id", userId)
      .order("nome")
      .then(({ data }: { data: ProgramaOption[] | null }) => {
        const studio = normalizeStudioName(estudio);
        setProgramasPodcast(
          (data || []).filter((programa) => {
            const programStudio = normalizeStudioName(programa.estudio);
            return programStudio === studio || programStudio.includes(studio) || studio.includes(programStudio);
          }),
        );
      });
  }, [open, isPodcastStudio, estudio, userId]);

  useEffect(() => {
    try {
      const savedCategories = JSON.parse(localStorage.getItem("nexohub-vmix-button-categories") || "[]");
      if (Array.isArray(savedCategories)) {
        setCustomCategories(savedCategories.filter((value): value is string => typeof value === "string" && value.trim().length > 0));
      }
    } catch {
      setCustomCategories([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (buttonId) {
      setLoading(true);
      (supabase.from("custom_vmix_buttons" as any) as any)
        .select("*")
        .eq("id", buttonId)
        .maybeSingle()
        .then(({ data }: any) => {
          if (data) {
            setNome(data.nome || "");
            // Prioriza o metadado legado do comando: a migração antiga preencheu AUDIO por padrão em todas as linhas.
            setButtonCategory(data.commands?.[0]?._buttonCategory || data.category || "");
            const savedButtonColor = data.color && data.color.toUpperCase() !== "#C6F03C" ? data.color : "#0756C9";
            setColor(savedButtonColor);
            setCustomColorMode(!["#0756C9", ...PRESET_BUTTON_COLORS.map(option => option.value)].includes(savedButtonColor.toUpperCase()));
            setDiasSemana(data.dias_semana || []);
            setDataEspecifica(data.data_especifica || "");
            setHorario(data.horario || "");
            setShortcut(data.shortcut || "");
            setIconKey(data.icon || "");
            setProgramaId(data.programa_id || getStoredProgramaId(data.commands));
            setCommands(Array.isArray(data.commands) ? data.commands : []);
          }
          setLoading(false);
        });
    } else {
      setNome("");
      setButtonCategory("");
      setNewCategoryName("");
      setShowNewCategoryInput(false);
      setColor("#0756C9");
      setCustomColorMode(false);
      setDiasSemana([]);
      setDataEspecifica("");
      setHorario("");
      setShortcut("");
      setIconKey("");
      setProgramaId("");
      setCommands([]);
      setLoading(false);
    }
  }, [open, buttonId]);


  const addCustomCategory = () => {
    const category = newCategoryName.trim().toUpperCase();
    if (!category) return;
    const allCategories = [...DEFAULT_BUTTON_CATEGORIES, ...customCategories];
    if (!allCategories.some(existing => existing.toUpperCase() === category)) {
      const nextCategories = [...customCategories, category];
      setCustomCategories(nextCategories);
      try { localStorage.setItem("nexohub-vmix-button-categories", JSON.stringify(nextCategories)); } catch { /* armazenamento local indisponível */ }
    }
    setButtonCategory(category);
    setNewCategoryName("");
    setShowNewCategoryInput(false);
  };

  const toggleDia = (dia: string) => {
    setDiasSemana(prev => prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia]);
  };

  const addCommand = () => {
    setCommands(prev => [...prev, { id: crypto.randomUUID(), fn: "CutDirect" }]);
  };

  const updateCommand = (id: string, updates: Partial<PresetCommand>) => {
    setCommands(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const removeCommand = (id: string) => {
    setCommands(prev => prev.filter(c => c.id !== id));
  };

  const moveCommand = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= commands.length) return;
    const arr = [...commands];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setCommands(arr);
  };

  const save = async () => {
    if (!nome.trim()) {
      toast({ title: "Nome obrigatório", description: "Informe um nome para o botão.", variant: "destructive" });
      return;
    }

    const isLiveButton = /\blive\b|ao\s*vivo/i.test(nome) || commands.some(command =>
      command.enabled !== false && command.fn === "StartStreaming",
    );

    if (isPodcastStudio && isLiveButton && !programaId) {
      toast({
        title: "Programa obrigatório",
        description: "Vincule este botão de live a um programa para sincronizá-lo com a Agenda.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    // O programa é metadado dentro do JSON das ações. Removemos explicitamente
    // a chave legada `programa_id` para que ela nunca seja interpretada pelo
    // PostgREST como uma coluna de `custom_vmix_buttons`.
    const savedCommands = commands.map((command, index) => {
      const { programa_id: _legacyProgramaId, agendaProgramId: _agendaProgramId, ...commandData } = command;
      return index === 0
        ? { ...commandData, agendaProgramId: isPodcastStudio ? programaId || null : null }
        : commandData;
    });

    const commandsWithCategory = savedCommands.map((command, index) => index === 0 ? { ...command, _buttonCategory: buttonCategory || null } : command);
    const payload = {
      nome: nome.trim(),
      // A categoria é persistida no JSON da primeira ação (_buttonCategory).
      // Nem todas as instâncias do banco possuem a coluna category.
      color,
      dias_semana: diasSemana,
      data_especifica: dataEspecifica || null,
      horario,
      commands: commandsWithCategory,
      estudio: estudio || null,
      shortcut: shortcut || null,
      icon: iconKey || null,
    };

    const result = buttonId
      ? await (supabase.from("custom_vmix_buttons" as any) as any)
          .update(payload)
          .eq("id", buttonId)
          .select("id")
          .single()
      : await (supabase.from("custom_vmix_buttons" as any) as any)
          .insert({ ...payload, user_id: userId })
          .select("id")
          .single();

    setSaving(false);

    if (result.error) {
      console.error("Erro ao salvar botão personalizado:", result.error);
      toast({
        title: "Não foi possível salvar",
        description: result.error.message || "Verifique a conexão e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Efeito salvo", description: `"${nome}" salvo com ${commands.length} ação(ões).` });
    await onSaved();
    onClose();
  };

  const runAll = async () => {
    setRunning(true);
    await onRunCommands(commands);
    setRunning(false);
  };

  const generateScript = (): string => {
    return commands.map(cmd => {
      let line = cmd.fn;
      if (cmd.input) line += ` input=${cmd.input}`;
      if (cmd.value) line += ` value=${cmd.value}`;
      if (cmd.extraKey) line += ` extraKey=${cmd.extraKey}`;
      if (cmd.extraValue) line += ` extra=${cmd.extraValue}`;
      return line;
    }).join("\n");
  };

  const parseScript = (text: string) => {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const parsed: PresetCommand[] = [];

    for (const rawLine of lines) {
      // Aceita linhas numeradas/exportadas, como "#0 : Stinger1(GUID,)".
      // Remove marcadores visuais de exportações/copiar-colar (*, #0 :, etc.)
      // sem alterar o nome real da função ou os argumentos do comando.
      const line = rawLine
        .replace(/^#?\d+\s*[:.)-]\s*/, "")
        .replace(/^\*+\s*/, "")
        .trim();
      if (!line) continue;

      // Formato vMix: Function=Stinger1&Input=GUID&Value=...
      if (/^Function\s*=/i.test(line)) {
        const params = new URLSearchParams(line.replace(/\s*&\s*/g, "&"));
        const fn = params.get("Function") || "";
        if (!fn) continue;
        const cmd: PresetCommand = { id: crypto.randomUUID(), fn };
        cmd.input = params.get("Input") || params.get("SelectedInput") || "";
        cmd.value = params.get("Value") || params.get("Duration") || "";
        parsed.push(cmd);
        continue;
      }

      // Formato de exportação por chamada: Function(arg1, arg2, ...).
      const call = line.match(/^([\w.-]+)\s*\((.*?)(?:\))?\s*[,;]?\s*$/);
      if (call) {
        let fn = call[1];
        const args = call[2].split(",").map(value => value.trim().replace(/^(['"])(.*)\1$/, "$2"));
        const cmd: PresetCommand = { id: crypto.randomUUID(), fn };
        if (args[0]) cmd.input = args[0];
        if (args[1]) cmd.value = args[1];
        if (args[2]) cmd.extraValue = args.slice(2).join(",");
        parsed.push(cmd);
        continue;
      }

      const parts = line.split(/\s+/);
      let fn = parts.shift() || "";
      if (!fn) continue;
      const cmd: PresetCommand = { id: crypto.randomUUID(), fn };
      for (const part of parts) {
        const separator = part.indexOf("=");
        if (separator < 1) continue;
        const key = part.slice(0, separator).toLowerCase();
        const value = part.slice(separator + 1);
        if (key === "input" || key === "selectedinput") cmd.input = value;
        else if (key === "value" || key === "duration" || key === "mix") cmd.value = value;
        else if (key === "extrakey" || key === "selectedname" || key === "selectedindex") cmd.extraKey = value;
        else if (key === "extra") cmd.extraValue = value;
      }
      parsed.push(cmd);
    }

    if (parsed.length > 0) {
      setCommands(prev => [...prev, ...parsed]);
      setPasteValue("");
      setShowCode(false);
      toast({ title: "Código importado", description: `${parsed.length} ação(ões) carregada(s).` });
    } else {
      toast({ title: "Nenhum comando reconhecido", description: "Cole comandos no formato Function(Input), Function input=... ou Function=...&Input=....", variant: "destructive" });
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl overflow-hidden" style={{ backgroundColor: "#1a1a22", border: "1px solid #333", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #ffffff0a", background: "linear-gradient(135deg, #1e1e28, #22222c)" }}>
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: "#eee" }}>
              {buttonId ? "Editar Botão" : "Novo Botão Personalizado"}
            </h2>
            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#ffffff08", color: "#666" }}>
              {commands.length} ação(ões)
            </span>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors" style={{ color: "#888" }}>
            <X size={16} />
          </button>
        </div>

        {/* Form + Commands */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5" style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin" size={20} style={{ color: "#666" }} />
            </div>
          ) : (
            <>
              {/* Name + shortcut */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#888" }}>
                    <Tag size={10} /> Nome do Botão
                  </label>
                  <input
                    type="text"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-lg outline-none"
                    style={{ backgroundColor: "#181820", color: "#ccc", border: "1px solid #333" }}
                    placeholder="Ex: Abertura Jornal, Vinheta Comercial..."
                  />
                </div>
                <div className="flex flex-col gap-2 sm:w-40">
                  <label className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#888" }}>
                    <Keyboard size={10} /> Atalho
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={shortcut}
                      readOnly
                      onKeyDown={e => {
                        e.preventDefault();
                        if (e.key === "Backspace" || e.key === "Delete" || e.key === "Escape") { setShortcut(""); return; }
                        if (e.key.length === 1 || /^F\d{1,2}$/.test(e.key)) {
                          setShortcut(`${e.ctrlKey ? "Ctrl+" : ""}${e.altKey ? "Alt+" : ""}${e.shiftKey ? "Shift+" : ""}${e.key.toUpperCase()}`);
                        }
                      }}
                      className="w-full text-center text-[11px] font-black uppercase px-3 py-2.5 rounded-lg outline-none cursor-pointer"
                      style={{ backgroundColor: "#181820", color: "#fff", border: `1px solid ${shortcut ? "#C6F03C60" : "#333"}` }}
                      placeholder="Clique e tecle"
                    />
                    {shortcut && (
                      <button onClick={() => setShortcut("")} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10" style={{ color: "#888" }}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {isPodcastStudio && (
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#888" }}>
                    <Radio size={10} /> Vincular ao Programa
                  </label>
                  <select
                    value={programaId}
                    onChange={e => setProgramaId(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-lg outline-none"
                    style={{ backgroundColor: "#181820", color: "#ccc", border: "1px solid #333" }}
                  >
                    <option value="">— Nenhum programa vinculado —</option>
                    {programasPodcast.map(programa => (
                      <option key={programa.id} value={programa.id}>
                        {programa.nome}{programa.ativo ? "" : " (inativo)"}
                      </option>
                    ))}
                  </select>
                  <span className="text-[8px]" style={{ color: "#555" }}>
                    O botão será associado ao programa selecionado na agenda do estúdio PODCAST.
                  </span>
                </div>
              )}

              {/* Seletor de ícone compacto com opções de cor ao lado. */}
              <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1.65fr)_minmax(220px,1fr)]">
              <div className="flex min-w-0 flex-col gap-2">
                <label className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#888" }}>
                  <Sparkles size={10} /> Ícone do Botão
                </label>
                <div className="relative">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={iconPickerOpen}
                    onClick={() => setIconPickerOpen(open => !open)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:border-[#397ff5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0065F9]"
                    style={{ backgroundColor: "#12121a", border: "1px solid #343440", color: "#e5e7eb" }}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}22`, color }}>
                      {iconKey && ICON_LIBRARY[iconKey] ? createElement(ICON_LIBRARY[iconKey], { size: 18 }) : <Sparkles size={18} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-bold">{iconKey || "Escolher ícone"}</span>
                      <span className="mt-0.5 block text-[9px] text-[#858594]">Selecione o símbolo que representará este botão</span>
                    </span>
                    <ChevronDown size={15} className={`shrink-0 transition-transform ${iconPickerOpen ? "rotate-180" : ""}`} />
                  </button>
                  {iconPickerOpen && (
                    <div role="dialog" aria-label="Escolher ícone do botão" className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl p-3 shadow-2xl" style={{ backgroundColor: "#17171f", border: "1px solid #3a3a48" }}>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#c4c4cf]">Escolha um ícone</span>
                        <button type="button" onClick={() => setIconPickerOpen(false)} className="rounded-md px-2 py-1 text-[10px] text-[#a5a5b5] hover:bg-white/10">Fechar</button>
                      </div>
                      <div className="grid max-h-44 grid-cols-6 gap-2 overflow-y-auto sm:grid-cols-8">
                        {Object.entries(ICON_LIBRARY).map(([key, Icon]) => {
                          const active = iconKey === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              title={key}
                              aria-label={key}
                              aria-pressed={active}
                              onClick={() => { setIconKey(key); setIconPickerOpen(false); }}
                              className="flex aspect-square items-center justify-center rounded-lg transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0065F9]"
                              style={{ backgroundColor: active ? `${color}26` : "#ffffff08", border: active ? `1px solid ${color}` : "1px solid #ffffff0d", color: active ? color : "#c4c4cf" }}
                            >
                              <Icon size={17} />
                            </button>
                          );
                        })}
                      </div>
                      {iconKey && (
                        <button type="button" onClick={() => { setIconKey(""); setIconPickerOpen(false); }} className="mt-2 rounded-md px-2 py-1.5 text-[10px] text-[#b8c0cc] hover:bg-white/10">
                          Remover ícone selecionado
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-[8px]" style={{ color: "#777" }}>O ícone escolhido será exibido no botão do switcher.</span>
                {/* Categoria */}
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: "#888" }}>
                    <Layers size={10} /> Categoria
                  </label>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <select value={buttonCategory} onChange={event => setButtonCategory(event.target.value)}
                      className="h-[34px] min-w-0 flex-1 rounded-lg px-2 text-[11px] font-semibold outline-none [color-scheme:dark]"
                      style={{ backgroundColor: "#181820", color: "#f4f4f5", border: "1px solid #333" }}>
                      <option value="">Selecionar categoria</option>
                      {[...DEFAULT_BUTTON_CATEGORIES, ...customCategories, ...(buttonCategory && ![...DEFAULT_BUTTON_CATEGORIES, ...customCategories].includes(buttonCategory) ? [buttonCategory] : [])].map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setShowNewCategoryInput(open => !open)} aria-label="Adicionar categoria" title="Adicionar categoria"
                      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-[#0756C9] text-lg font-medium text-white hover:bg-[#0b65e5]">+</button>
                  </div>
                  {showNewCategoryInput && (
                    <div className="flex gap-1">
                      <input autoFocus value={newCategoryName} onChange={event => setNewCategoryName(event.target.value)}
                        onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addCustomCategory(); } }}
                        placeholder="Nova categoria" className="h-7 min-w-0 flex-1 rounded-md px-2 text-[10px] outline-none"
                        style={{ backgroundColor: "#181820", color: "#fff", border: "1px solid #333" }} />
                      <button type="button" onClick={addCustomCategory} className="rounded-md bg-[#0756C9] px-2 text-[9px] font-bold text-white">Adicionar</button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-2">
                <label className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#888" }}>
                  <Palette size={10} /> Cor do Botão
                </label>
                <div className="flex min-h-10 flex-nowrap items-center gap-1.5 rounded-xl px-2 py-2" style={{ backgroundColor: "#12121a", border: "1px solid #343440" }}>
                  <div role="button" tabIndex={0} onClick={() => { setColor("#0756C9"); setCustomColorMode(false); setCustomColorPickerOpen(false); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setColor("#0756C9"); setCustomColorMode(false); setCustomColorPickerOpen(false); } }} aria-label="Azul padrão do site" aria-pressed={color.toUpperCase() === "#0756C9"} title="Azul padrão do site"
                    className="h-7 w-7 shrink-0 cursor-pointer rounded-md border-2 transition-transform hover:scale-105"
                    style={{ backgroundColor: "#0756C9", borderColor: color.toUpperCase() === "#0756C9" ? "#FFFFFF" : "#ffffff30" }} />
                  {PRESET_BUTTON_COLORS.map(option => (
                    <div key={option.value} role="button" tabIndex={0} onClick={() => { setColor(option.value); setCustomColorMode(false); setCustomColorPickerOpen(false); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setColor(option.value); setCustomColorMode(false); setCustomColorPickerOpen(false); } }} aria-label={option.label} aria-pressed={!customColorMode && color.toUpperCase() === option.value}
                      title={option.label} className="h-7 w-7 shrink-0 cursor-pointer rounded-md border-2 transition-transform hover:scale-105"
                      style={{ backgroundColor: option.value, borderColor: !customColorMode && color.toUpperCase() === option.value ? "#FFFFFF" : "#ffffff30" }} />
                  ))}
                  <div className="relative shrink-0">
                    <button type="button" onClick={() => { setCustomColorMode(true); setCustomColorPickerOpen(open => !open); }} aria-label="Escolher cor personalizada" aria-expanded={customColorPickerOpen} title="Cor personalizada"
                      className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md border-2 transition-transform hover:scale-105"
                      style={{ backgroundColor: customColorMode ? color : "#252530", borderColor: customColorMode ? "#FFFFFF" : "#ffffff30" }}>
                      <Palette size={13} color="#fff" />
                    </button>
                    {customColorPickerOpen && (
                      <div className="absolute right-0 top-full z-[70] mt-2 w-52 rounded-xl border border-white/15 p-3 shadow-2xl" style={{ backgroundColor: "#19191f" }}>
                        <label className="mb-2 block text-[9px] font-bold uppercase tracking-wider text-white/65">Cor personalizada</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={color} onChange={event => { setColor(event.target.value.toUpperCase()); setCustomColorMode(true); }} aria-label="Selecionar cor visualmente" className="h-9 w-10 cursor-pointer rounded border-0 bg-transparent p-0" />
                          <input
                            key={color}
                            type="text"
                            defaultValue={color.toUpperCase()}
                            maxLength={7}
                            spellCheck={false}
                            autoCapitalize="characters"
                            onChange={event => {
                              const value = event.target.value.trim().toUpperCase();
                              if (/^#[0-9A-F]{6}$/.test(value)) { setColor(value); setCustomColorMode(true); }
                            }}
                            onBlur={event => {
                              const value = event.target.value.trim().toUpperCase();
                              if (!/^#[0-9A-F]{6}$/.test(value)) event.currentTarget.value = color.toUpperCase();
                            }}
                            onKeyDown={event => { if (event.key === "Enter") setCustomColorPickerOpen(false); }}
                            placeholder="#BFFF00"
                            aria-label="Colar código hexadecimal da cor"
                            className="h-9 min-w-0 flex-1 rounded-lg px-2 text-xs font-bold uppercase outline-none focus:border-[#0756C9]"
                            style={{ backgroundColor: "#181820", color: "#F4F4F5", border: "1px solid #3A3A46" }}
                          />
                        </div>
                        <button type="button" onClick={() => setCustomColorPickerOpen(false)} className="mt-2 w-full rounded-md bg-[#0756C9] py-1.5 text-[10px] font-bold text-white">Concluir</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </div>

              {/* Agenda, horário e dias da semana */}
              <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(150px,1fr)_minmax(100px,0.7fr)_minmax(190px,1.25fr)]">
                {/* Data específica */}
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: "#888" }}>
                    <Calendar size={10} color="#ffffff" /> Data Específica
                  </label>
                  <input
                    type="date"
                    value={dataEspecifica}
                    onChange={e => setDataEspecifica(e.target.value)}
                    className="h-[34px] w-full min-w-0 box-border text-xs px-2.5 py-2 rounded-lg outline-none [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:invert"
                    style={{ backgroundColor: "#181820", color: "#ccc", border: "1px solid #333" }}
                  />
                  <span className="text-[8px]" style={{ color: "#555" }}>Opcional: dia único</span>
                </div>

                {/* Horário */}
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: "#888" }}>
                    <Clock size={10} color="#ffffff" /> Horário
                  </label>
                  <input
                    type="time"
                    value={horario}
                    onChange={e => setHorario(e.target.value)}
                    className="h-[34px] w-full min-w-0 box-border text-xs px-2.5 py-2 rounded-lg outline-none [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-calendar-picker-indicator]:invert"
                    style={{ backgroundColor: "#181820", color: "#ccc", border: "1px solid #333" }}
                  />
                  <span className="text-[8px]" style={{ color: "#555" }}>Opcional</span>
                </div>

                {/* Dias da semana */}
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label className="text-[9px] font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: "#888" }}>
                    <Clock size={10} /> Dias da Semana
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {DIAS_SEMANA.map(dia => {
                      const active = diasSemana.includes(dia);
                      return (
                        <button
                          type="button"
                          key={dia}
                          aria-pressed={active}
                          onClick={() => toggleDia(dia)}
                          className="text-[9px] font-bold px-1.5 py-1 rounded transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60A5FA]"
                          style={{
                            backgroundColor: active ? "#0756C9" : "#ffffff08",
                            color: active ? "#ffffff" : "#a1a1aa",
                            border: active ? "1px solid #60A5FA" : "1px solid #ffffff12",
                            boxShadow: active ? "0 0 0 1px #0756C944" : "none",
                          }}
                        >
                          {dia.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Ações do botão e acesso para colar código */}
              <div className="flex flex-col gap-2 pt-2">
                <div className="flex justify-end">
                  <button
                    onClick={() => { setShowCode(!showCode); if (!showCode) setPasteValue(""); }}
                    className="flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded transition-all hover:bg-white/10"
                    style={{ color: "#8b5cf6" }}
                  >
                    <Code size={10} />
                    {showCode ? "Fechar Código" : "Colar Código"}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#666" }}>Ações do Botão</span>
                  <div className="flex-1 h-px" style={{ backgroundColor: "#ffffff08" }} />
                </div>
              </div>

              {/* Code paste section */}
              {showCode && (
                <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: "#12121a", border: "1px solid #333" }}>
                  {commands.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#666" }}>Código Atual</label>
                        <button
                          onClick={() => { navigator.clipboard.writeText(generateScript()); toast({ title: "Copiado!" }); }}
                          className="flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors"
                          style={{ color: "#8b5cf6" }}
                        >
                          <Copy size={8} /> Copiar
                        </button>
                      </div>
                      <pre className="text-[10px] p-2 rounded overflow-x-auto" style={{ backgroundColor: "#0a0a12", color: "#8b5cf6", border: "1px solid #222" }}>{generateScript()}</pre>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <label className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#666" }}>Colar Código</label>
                    <textarea
                      value={pasteValue}
                      onChange={e => setPasteValue(e.target.value)}
                      rows={4}
                      className="w-full text-[10px] px-2.5 py-2 rounded-lg outline-none font-mono"
                      style={{ backgroundColor: "#ffffff", color: "#4b5563", border: "1px solid #d1d5db", resize: "vertical" }}
                      placeholder={"CutDirect input=abc123\nFade input=xyz value=1000\nOverlayInput1 input=abc"}
                    />
                    <button
                      onClick={() => parseScript(pasteValue)}
                      disabled={!pasteValue.trim()}
                      className="self-end flex items-center gap-1 text-[9px] font-bold px-3 py-1.5 rounded-lg transition-all hover:scale-[1.03] disabled:opacity-30"
                      style={{ backgroundColor: "#8b5cf615", color: "#8b5cf6", border: "1px solid #8b5cf630" }}
                    >
                      <ClipboardPaste size={10} /> Importar
                    </button>
                  </div>
                </div>
              )}

              {/* Commands list */}
              {commands.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-xs mb-1" style={{ color: "#666" }}>Nenhuma ação configurada.</p>
                  <p className="text-[10px]" style={{ color: "#555" }}>Clique em "Adicionar Ação" para programar este botão.</p>
                </div>
              ) : (
                commands.map((cmd, idx) => {
                  const def = getCommandDef(cmd.fn);
                  const hasInput = def?.params.includes("input");
                  const hasValue = def?.params.includes("value");
                  const hasExtra = def?.params.includes("extra");
                  const extraLabels = getExtraLabel(cmd.fn);
                  const isStreamingFn = cmd.fn === "StartStreaming" || cmd.fn === "StopStreaming";
                  const isMultiViewOverlayFn = cmd.fn === "MultiViewOverlayOn" || cmd.fn === "MultiViewOverlayOff";

                  const cmdEnabled = cmd.enabled !== false;

                  return (
                    <div key={cmd.id} className="rounded-lg overflow-hidden transition-opacity" style={{ backgroundColor: "#222230", border: "1px solid #2a2a38", opacity: cmdEnabled ? 1 : 0.45 }}>
                      <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: "#ffffff04", borderBottom: "1px solid #ffffff06" }}>
                        <span className="text-[9px] font-black w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: idx === 0 ? "#dc262630" : "#ffffff08", color: idx === 0 ? "#dc2626" : "#888" }}>
                          #{idx}
                        </span>
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <GripVertical size={10} style={{ color: "#444" }} />
                          <span className="text-[10px] font-bold truncate" style={{ color: "#ccc" }}>{formatCommandPreview(cmd, inputs, inputMapping)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => moveCommand(idx, -1)} disabled={idx === 0} className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-20" style={{ color: "#888" }}>
                            <ChevronUp size={10} />
                          </button>
                          <button onClick={() => moveCommand(idx, 1)} disabled={idx === commands.length - 1} className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 transition-colors disabled:opacity-20" style={{ color: "#888" }}>
                            <ChevronDown size={10} />
                          </button>
                          <button onClick={() => removeCommand(cmd.id)} className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-500/20 transition-colors" style={{ color: "#f87171" }}>
                            <Trash2 size={10} />
                          </button>
                          <Switch
                            checked={cmdEnabled}
                            onCheckedChange={v => updateCommand(cmd.id, { enabled: v })}
                            aria-label={cmdEnabled ? "Desabilitar comando" : "Habilitar comando"}
                            className="scale-75"
                          />
                        </div>
                      </div>


                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3">
                        <div className="flex flex-col gap-1 sm:col-span-2">
                          <label className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#666" }}>Command</label>
                          <select
                            value={cmd.fn}
                            onChange={e => updateCommand(cmd.id, { fn: e.target.value, input: undefined, value: undefined, extraKey: undefined, extraValue: undefined })}
                            className="h-[34px] w-full min-w-0 box-border text-[11px] px-2.5 py-2 rounded-lg outline-none transition-colors focus:border-[#0065F9] focus:ring-2 focus:ring-[#0065F9]/20 [color-scheme:dark]"
                            style={{ backgroundColor: "#181820", color: "#F4F4F5", border: "1px solid #3A3A46", colorScheme: "dark" }}
                          >
                            {/*
                              Funções importadas que não fazem parte do catálogo padrão
                              precisam continuar visíveis no seletor; caso contrário, o
                              navegador mostra visualmente a primeira opção (CutDirect),
                              embora o comando salvo seja outro.
                            */}
                            {!PRESET_COMMANDS.some(c => c.value === cmd.fn) && (
                              <option value={cmd.fn}>{cmd.fn} — função importada</option>
                            )}
                            {CATEGORIES.map(cat => (
                              <optgroup key={cat} label={cat}>
                                {PRESET_COMMANDS.filter(c => c.category === cat).map(c => (
                                  <option key={c.value} value={c.value}>{c.value} — {c.desc}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>

                        {hasInput && (
                          <div className="flex flex-col gap-1">
                            <label className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#666" }}>Input</label>
                            <select
                              value={cmd.input || ""}
                              onChange={e => updateCommand(cmd.id, { input: e.target.value })}
                              className="w-full min-h-10 text-[11px] px-3.5 py-2.5 rounded-xl outline-none transition-colors focus:border-[#0065F9] focus:ring-2 focus:ring-[#0065F9]/20"
                              style={{ backgroundColor: "#181820", color: "#F4F4F5", border: "1px solid #3A3A46", colorScheme: "dark" }}
                            >
                              <option value="">— Selecionar Input —</option>
                              {cmd.input && !inputs.some(i => i.key === cmd.input) && inputMapping?.[cmd.input] && (
                                <option value={cmd.input} disabled>
                                  ⚠️ {inputMapping[cmd.input].title} (Não encontrado)
                                </option>
                              )}
                              {inputs.map(inp => (
                                <option key={inp.key} value={inp.key}>{inp.number} – {inp.title}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {hasValue && (
                          <div className="flex flex-col gap-1">
                            <label className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#666" }}>
                              {cmd.fn === "SelectIndex" ? "Index" : cmd.fn === "Fade" ? "Duração (ms)" : cmd.fn === "SetVolume" ? "Volume (0-100)" : isStreamingFn ? "Streaming" : isMultiViewOverlayFn ? "Index (1-10)" : hasExtra ? extraLabels.keyLabel : "Value"}
                            </label>
                            {isStreamingFn ? (
                              <select
                                value={cmd.value ?? "0"}
                                onChange={e => updateCommand(cmd.id, { value: e.target.value })}
                                className="w-full min-h-10 text-[11px] px-3.5 py-2.5 rounded-xl outline-none transition-colors focus:border-[#0065F9] focus:ring-2 focus:ring-[#0065F9]/20"
                                style={{ backgroundColor: "#181820", color: "#F4F4F5", border: "1px solid #3A3A46", colorScheme: "dark" }}
                              >
                                <option value="0">Streaming 0</option>
                                <option value="1">Streaming 1</option>
                                <option value="2">Streaming 2</option>
                              </select>
                            ) : isMultiViewOverlayFn ? (
                              <select
                                value={cmd.value || "1"}
                                onChange={e => updateCommand(cmd.id, { value: e.target.value })}
                                className="w-full min-h-10 text-[11px] px-3.5 py-2.5 rounded-xl outline-none transition-colors focus:border-[#0065F9] focus:ring-2 focus:ring-[#0065F9]/20"
                                style={{ backgroundColor: "#181820", color: "#F4F4F5", border: "1px solid #3A3A46", colorScheme: "dark" }}
                              >
                                {Array.from({ length: 10 }, (_, i) => String(i + 1)).map(n => (
                                  <option key={n} value={n}>Index {n}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={cmd.value || ""}
                                onChange={e => updateCommand(cmd.id, { value: e.target.value })}
                                className="w-full min-h-10 text-[11px] px-3.5 py-2.5 rounded-xl outline-none transition-colors focus:border-[#0065F9] focus:ring-2 focus:ring-[#0065F9]/20"
                                style={{ backgroundColor: "#181820", color: "#F4F4F5", border: "1px solid #3A3A46", colorScheme: "dark" }}
                                placeholder="Valor..."
                              />
                            )}
                          </div>
                        )}

                        {hasExtra && (
                          <div className="flex flex-col gap-1 sm:col-span-2">
                            <label className="text-[8px] font-bold uppercase tracking-widest" style={{ color: "#666" }}>{extraLabels.valueLabel}</label>
                            <input
                              type="text"
                              value={cmd.extraValue || ""}
                              onChange={e => updateCommand(cmd.id, { extraValue: e.target.value })}
                              className="w-full min-h-10 text-[11px] px-3.5 py-2.5 rounded-xl outline-none transition-colors focus:border-[#0065F9] focus:ring-2 focus:ring-[#0065F9]/20"
                              style={{ backgroundColor: "#181820", color: "#F4F4F5", border: "1px solid #3A3A46", colorScheme: "dark" }}
                              placeholder={extraLabels.valueLabel + "..."}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3" style={{ borderTop: "1px solid #ffffff0a", backgroundColor: "#ffffff03" }}>
          <button
            onClick={addCommand}
            className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all hover:scale-[1.03]"
            style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)", color: "var(--layout-icon-color, #888888)", border: "1px solid color-mix(in srgb, var(--layout-accent-color, #2563eb) 20%, transparent)" }}
          >
            <Plus size={12} />
            Adicionar Ação
          </button>
          <div className="flex items-center gap-2">
            {commands.length > 0 && (
              <button
                onClick={runAll}
                disabled={running}
                className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all hover:scale-[1.03]"
                style={{ backgroundColor: "#22c55e15", color: "#22c55e", border: "1px solid #22c55e30" }}
              >
                {running ? <Loader2 className="animate-spin" size={12} /> : <Play size={12} />}
                Testar
              </button>
            )}
            <Button variant="save"
              onClick={save}
              disabled={saving}
            >
              {saving ? <Loader2 className="animate-spin" size={12} /> : null}
              Salvar
            </Button>
            <button
              onClick={onClose}
              className="text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: "#888" }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
