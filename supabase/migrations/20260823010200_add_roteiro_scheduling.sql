-- Adiciona colunas para agendamento de envio de roteiro para XML
ALTER TABLE public.roteiros 
ADD COLUMN IF NOT EXISTS agendado_para_envio timestamptz,
ADD COLUMN IF NOT EXISTS enviado_agendamento boolean DEFAULT false;

COMMENT ON COLUMN public.roteiros.agendado_para_envio IS 'Data e hora programada para que este roteiro seja enviado ao XML';
COMMENT ON COLUMN public.roteiros.enviado_agendamento IS 'Indica se o agendamento já foi processado e enviado';
