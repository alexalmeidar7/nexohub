export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_messages: {
        Row: {
          created_at: string
          id: string
          is_broadcast: boolean
          is_read: boolean
          message: string
          recipient_id: string | null
          sender_id: string
          subject: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_broadcast?: boolean
          is_read?: boolean
          message?: string
          recipient_id?: string | null
          sender_id: string
          subject?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_broadcast?: boolean
          is_read?: boolean
          message?: string
          recipient_id?: string | null
          sender_id?: string
          subject?: string
        }
        Relationships: []
      }
      agenda_eventos: {
        Row: {
          artes_urls: string[] | null
          created_at: string
          data: string
          descricao: string | null
          edicao_concluida: boolean
          edicao_notas: string
          excecoes: Json
          horario_gravacao: string | null
          horario_gravacao_fim: string | null
          id: string
          local: string
          periodo_fim: string | null
          periodo_inicio: string | null
          prioridade: string
          programa_id: string | null
          recorrencia: string
          status: string
          tipo_evento: string
          user_id: string
          youtube_descricao: string
          youtube_titulo: string
          youtube_url: string | null
        }
        Insert: {
          artes_urls?: string[] | null
          created_at?: string
          data: string
          descricao?: string | null
          edicao_concluida?: boolean
          edicao_notas?: string
          excecoes?: Json
          horario_gravacao?: string | null
          horario_gravacao_fim?: string | null
          id?: string
          local?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          prioridade?: string
          programa_id?: string | null
          recorrencia?: string
          status?: string
          tipo_evento?: string
          user_id: string
          youtube_descricao?: string
          youtube_titulo?: string
          youtube_url?: string | null
        }
        Update: {
          artes_urls?: string[] | null
          created_at?: string
          data?: string
          descricao?: string | null
          edicao_concluida?: boolean
          edicao_notas?: string
          excecoes?: Json
          horario_gravacao?: string | null
          horario_gravacao_fim?: string | null
          id?: string
          local?: string
          periodo_fim?: string | null
          periodo_inicio?: string | null
          prioridade?: string
          programa_id?: string | null
          recorrencia?: string
          status?: string
          tipo_evento?: string
          user_id?: string
          youtube_descricao?: string
          youtube_titulo?: string
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agenda_eventos_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "programas"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_participantes: {
        Row: {
          created_at: string
          evento_id: string
          id: string
          instagram: string | null
          nome: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evento_id: string
          id?: string
          instagram?: string | null
          nome: string
          user_id: string
        }
        Update: {
          created_at?: string
          evento_id?: string
          id?: string
          instagram?: string | null
          nome?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_participantes_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "agenda_eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      apresentadores: {
        Row: {
          ativo: boolean | null
          background_url: string | null
          cargo: string | null
          categoria: string | null
          created_at: string
          foto: string | null
          id: string
          instagram: string | null
          nome: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean | null
          background_url?: string | null
          cargo?: string | null
          categoria?: string | null
          created_at?: string
          foto?: string | null
          id?: string
          instagram?: string | null
          nome: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean | null
          background_url?: string | null
          cargo?: string | null
          categoria?: string | null
          created_at?: string
          foto?: string | null
          id?: string
          instagram?: string | null
          nome?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      audiencia_historico: {
        Row: {
          audio: number
          created_at: string
          id: string
          programa: string | null
          user_id: string
          video: number
          youtube: number
        }
        Insert: {
          audio?: number
          created_at?: string
          id?: string
          programa?: string | null
          user_id: string
          video?: number
          youtube?: number
        }
        Update: {
          audio?: number
          created_at?: string
          id?: string
          programa?: string | null
          user_id?: string
          video?: number
          youtube?: number
        }
        Relationships: []
      }
      available_modules: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          key: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          key?: string
          name?: string
        }
        Relationships: []
      }
      batalhas_agendadas: {
        Row: {
          artista1_imagem: string
          artista1_musica: string
          artista1_nome: string
          artista1_porcentagem: number
          artista2_imagem: string
          artista2_musica: string
          artista2_nome: string
          artista2_porcentagem: number
          created_at: string
          data_batalha: string
          horario_fim: string
          horario_inicio: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          artista1_imagem?: string
          artista1_musica?: string
          artista1_nome?: string
          artista1_porcentagem?: number
          artista2_imagem?: string
          artista2_musica?: string
          artista2_nome?: string
          artista2_porcentagem?: number
          created_at?: string
          data_batalha: string
          horario_fim: string
          horario_inicio: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          artista1_imagem?: string
          artista1_musica?: string
          artista1_nome?: string
          artista1_porcentagem?: number
          artista2_imagem?: string
          artista2_musica?: string
          artista2_nome?: string
          artista2_porcentagem?: number
          created_at?: string
          data_batalha?: string
          horario_fim?: string
          horario_inicio?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blitz_promocionais: {
        Row: {
          agenda_evento_id: string | null
          cliente: string
          created_at: string
          data_realizacao: string | null
          dia: string
          equipe: string | null
          horario: string
          horario_fim: string | null
          id: string
          observacoes: string | null
          realizada: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          agenda_evento_id?: string | null
          cliente: string
          created_at?: string
          data_realizacao?: string | null
          dia: string
          equipe?: string | null
          horario: string
          horario_fim?: string | null
          id?: string
          observacoes?: string | null
          realizada?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          agenda_evento_id?: string | null
          cliente?: string
          created_at?: string
          data_realizacao?: string | null
          dia?: string
          equipe?: string | null
          horario?: string
          horario_fim?: string | null
          id?: string
          observacoes?: string | null
          realizada?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blitz_promocionais_historico: {
        Row: {
          acao: string
          blitz_id: string | null
          changed_by: string | null
          changed_by_email: string | null
          cliente: string | null
          created_at: string
          dados_antes: Json | null
          dados_depois: Json | null
          id: string
          motivo: string | null
          user_id: string
        }
        Insert: {
          acao: string
          blitz_id?: string | null
          changed_by?: string | null
          changed_by_email?: string | null
          cliente?: string | null
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          motivo?: string | null
          user_id: string
        }
        Update: {
          acao?: string
          blitz_id?: string | null
          changed_by?: string | null
          changed_by_email?: string | null
          cliente?: string | null
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          motivo?: string | null
          user_id?: string
        }
        Relationships: []
      }
      broadcast_assuntos: {
        Row: {
          bg_color: string
          created_at: string
          font_family: string
          id: string
          mensagens: Json
          mensagens_enabled: boolean[]
          programa_id: string
          rotation_seconds: number
          text_color: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bg_color?: string
          created_at?: string
          font_family?: string
          id?: string
          mensagens?: Json
          mensagens_enabled?: boolean[]
          programa_id: string
          rotation_seconds?: number
          text_color?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bg_color?: string
          created_at?: string
          font_family?: string
          id?: string
          mensagens?: Json
          mensagens_enabled?: boolean[]
          programa_id?: string
          rotation_seconds?: number
          text_color?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cenario_estudio_grupos: {
        Row: {
          cols: number
          created_at: string
          id: string
          nome: string
          programa_ids: string[]
          rows: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cols?: number
          created_at?: string
          id?: string
          nome?: string
          programa_ids?: string[]
          rows?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cols?: number
          created_at?: string
          id?: string
          nome?: string
          programa_ids?: string[]
          rows?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cenario_estudio_tvs: {
        Row: {
          created_at: string
          grupo_id: string
          id: string
          imagem_url: string
          posicao: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grupo_id: string
          id?: string
          imagem_url?: string
          posicao?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          grupo_id?: string
          id?: string
          imagem_url?: string
          posicao?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cenario_estudio_tvs_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "cenario_estudio_grupos"
            referencedColumns: ["id"]
          },
        ]
      }
      cenario_estudio_web: {
        Row: {
          content: Json
          created_at: string
          id: string
          nome: string
          orientation: string
          tv_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          nome?: string
          orientation?: string
          tv_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          nome?: string
          orientation?: string
          tv_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      client_actions_history: {
        Row: {
          action_type: string
          client_id: string
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action_type: string
          client_id: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action_type?: string
          client_id?: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      client_modules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          module_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          module_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          module_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_modules_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "available_modules"
            referencedColumns: ["key"]
          },
        ]
      }
      client_trash: {
        Row: {
          created_at: string
          deleted_at: string
          deleted_by: string | null
          email: string | null
          id: string
          nome: string | null
          purge_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string
          deleted_by?: string | null
          email?: string | null
          id?: string
          nome?: string | null
          purge_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string
          deleted_by?: string | null
          email?: string | null
          id?: string
          nome?: string | null
          purge_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comercial_mockups: {
        Row: {
          config: Json | null
          created_at: string | null
          fields: Json | null
          id: string
          image_url: string | null
          name: string
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          fields?: Json | null
          id?: string
          image_url?: string | null
          name: string
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          fields?: Json | null
          id?: string
          image_url?: string | null
          name?: string
        }
        Relationships: []
      }
      comercial_preroll: {
        Row: {
          active: boolean
          ads_canais: string[] | null
          ads_cliente: string | null
          aspect_ratio: string
          background_url: string | null
          clicks_count: number
          created_at: string
          data_final: string | null
          data_inicial: string | null
          dias_semana: string[] | null
          horario_fim: string
          horario_inicio: string
          id: string
          is_midroll: boolean
          link_url: string | null
          media_type: string
          nome: string
          placements: string[]
          priority: number
          skip_enabled: boolean
          updated_at: string
          user_id: string
          video_position: string
          video_url: string
          views_count: number
          youtube_url: string | null
        }
        Insert: {
          active?: boolean
          ads_canais?: string[] | null
          ads_cliente?: string | null
          aspect_ratio?: string
          background_url?: string | null
          clicks_count?: number
          created_at?: string
          data_final?: string | null
          data_inicial?: string | null
          dias_semana?: string[] | null
          horario_fim: string
          horario_inicio: string
          id?: string
          is_midroll?: boolean
          link_url?: string | null
          media_type?: string
          nome?: string
          placements?: string[]
          priority?: number
          skip_enabled?: boolean
          updated_at?: string
          user_id: string
          video_position?: string
          video_url?: string
          views_count?: number
          youtube_url?: string | null
        }
        Update: {
          active?: boolean
          ads_canais?: string[] | null
          ads_cliente?: string | null
          aspect_ratio?: string
          background_url?: string | null
          clicks_count?: number
          created_at?: string
          data_final?: string | null
          data_inicial?: string | null
          dias_semana?: string[] | null
          horario_fim?: string
          horario_inicio?: string
          id?: string
          is_midroll?: boolean
          link_url?: string | null
          media_type?: string
          nome?: string
          placements?: string[]
          priority?: number
          skip_enabled?: boolean
          updated_at?: string
          user_id?: string
          video_position?: string
          video_url?: string
          views_count?: number
          youtube_url?: string | null
        }
        Relationships: []
      }
      comercial_propostas: {
        Row: {
          created_at: string | null
          data: Json | null
          final_art_url: string | null
          id: string
          mockup_id: string | null
          status: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          final_art_url?: string | null
          id?: string
          mockup_id?: string | null
          status?: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          final_art_url?: string | null
          id?: string
          mockup_id?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comercial_propostas_mockup_id_fkey"
            columns: ["mockup_id"]
            isOneToOne: false
            referencedRelation: "comercial_mockups"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_enquete_categories: {
        Row: {
          created_at: string
          generated_date: string
          id: string
          nome: string
          quizzes: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          generated_date?: string
          id?: string
          nome: string
          quizzes?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          generated_date?: string
          id?: string
          nome?: string
          quizzes?: Json
          user_id?: string
        }
        Relationships: []
      }
      custom_news_sites: {
        Row: {
          category: string | null
          created_at: string
          id: string
          name: string
          parent_id: string | null
          rss_url: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          rss_url: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          rss_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_news_sites_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "custom_news_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_quiz_categories: {
        Row: {
          created_at: string
          generated_date: string
          id: string
          nome: string
          quizzes: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          generated_date?: string
          id?: string
          nome: string
          quizzes?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          generated_date?: string
          id?: string
          nome?: string
          quizzes?: Json
          user_id?: string
        }
        Relationships: []
      }
      custom_vmix_buttons: {
        Row: {
          color: string | null
          commands: Json
          created_at: string
          data_especifica: string | null
          dias_semana: string[] | null
          estudio: string | null
          horario: string | null
          icon: string | null
          id: string
          nome: string
          shortcut: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          commands?: Json
          created_at?: string
          data_especifica?: string | null
          dias_semana?: string[] | null
          estudio?: string | null
          horario?: string | null
          icon?: string | null
          id?: string
          nome?: string
          shortcut?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          commands?: Json
          created_at?: string
          data_especifica?: string | null
          dias_semana?: string[] | null
          estudio?: string | null
          horario?: string | null
          icon?: string | null
          id?: string
          nome?: string
          shortcut?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      empresa_config: {
        Row: {
          ativo: boolean
          audio_sources: Json
          audio_stream_api_url: string | null
          audio_stream_xpath: string | null
          background_url: string | null
          cliente_desde: string | null
          cnpj: string | null
          endereco: string | null
          executiva_venda: string | null
          facebook: string | null
          facebook_subs: number | null
          id: string
          instagram: string | null
          instagram_subs: number | null
          logo: string | null
          nome: string | null
          plano: string
          site: string | null
          telefone_comercial: string | null
          telefone_participacao: string | null
          timezone: string
          updated_at: string
          user_id: string
          video_sources: Json
          video_stream_api_url: string | null
          video_stream_xpath: string | null
          youtube: string | null
          youtube_api_key: string | null
          youtube_channel_id: string | null
          youtube_subs: number | null
        }
        Insert: {
          ativo?: boolean
          audio_sources?: Json
          audio_stream_api_url?: string | null
          audio_stream_xpath?: string | null
          background_url?: string | null
          cliente_desde?: string | null
          cnpj?: string | null
          endereco?: string | null
          executiva_venda?: string | null
          facebook?: string | null
          facebook_subs?: number | null
          id?: string
          instagram?: string | null
          instagram_subs?: number | null
          logo?: string | null
          nome?: string | null
          plano?: string
          site?: string | null
          telefone_comercial?: string | null
          telefone_participacao?: string | null
          timezone?: string
          updated_at?: string
          user_id: string
          video_sources?: Json
          video_stream_api_url?: string | null
          video_stream_xpath?: string | null
          youtube?: string | null
          youtube_api_key?: string | null
          youtube_channel_id?: string | null
          youtube_subs?: number | null
        }
        Update: {
          ativo?: boolean
          audio_sources?: Json
          audio_stream_api_url?: string | null
          audio_stream_xpath?: string | null
          background_url?: string | null
          cliente_desde?: string | null
          cnpj?: string | null
          endereco?: string | null
          executiva_venda?: string | null
          facebook?: string | null
          facebook_subs?: number | null
          id?: string
          instagram?: string | null
          instagram_subs?: number | null
          logo?: string | null
          nome?: string | null
          plano?: string
          site?: string | null
          telefone_comercial?: string | null
          telefone_participacao?: string | null
          timezone?: string
          updated_at?: string
          user_id?: string
          video_sources?: Json
          video_stream_api_url?: string | null
          video_stream_xpath?: string | null
          youtube?: string | null
          youtube_api_key?: string | null
          youtube_channel_id?: string | null
          youtube_subs?: number | null
        }
        Relationships: []
      }
      enquetes_agendadas: {
        Row: {
          created_at: string
          data_enquete: string
          horario_fim: string
          horario_inicio: string
          id: string
          pergunta: string
          resposta_correta: number
          resposta1: string
          resposta2: string
          resposta3: string
          resposta4: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_enquete: string
          horario_fim: string
          horario_inicio: string
          id?: string
          pergunta?: string
          resposta_correta?: number
          resposta1?: string
          resposta2?: string
          resposta3?: string
          resposta4?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_enquete?: string
          horario_fim?: string
          horario_inicio?: string
          id?: string
          pergunta?: string
          resposta_correta?: number
          resposta1?: string
          resposta2?: string
          resposta3?: string
          resposta4?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      escalada_news: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          portal: string
          resumo: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          portal: string
          resumo?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          portal?: string
          resumo?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          created_at: string
          id: string
          refresh_token: string
          token_expiry: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          refresh_token: string
          token_expiry: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          refresh_token?: string
          token_expiry?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      infomusic: {
        Row: {
          artista: string
          created_at: string
          curiosidade: string
          deezer_artist_img: string | null
          expires_at: string
          id: string
          musica: string
          user_id: string
        }
        Insert: {
          artista: string
          created_at?: string
          curiosidade: string
          deezer_artist_img?: string | null
          expires_at?: string
          id?: string
          musica: string
          user_id: string
        }
        Update: {
          artista?: string
          created_at?: string
          curiosidade?: string
          deezer_artist_img?: string | null
          expires_at?: string
          id?: string
          musica?: string
          user_id?: string
        }
        Relationships: []
      }
      infomusic_excecoes: {
        Row: {
          artista_url: string | null
          background_url: string | null
          capa_url: string | null
          created_at: string | null
          id: string
          termo: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          artista_url?: string | null
          background_url?: string | null
          capa_url?: string | null
          created_at?: string | null
          id?: string
          termo: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          artista_url?: string | null
          background_url?: string | null
          capa_url?: string | null
          created_at?: string | null
          id?: string
          termo?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      logos_patrocinadores: {
        Row: {
          ativo: boolean
          created_at: string
          data_final: string
          excluido: boolean
          excluido_at: string | null
          id: string
          logo_url: string
          nome: string
          programa_id: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_final: string
          excluido?: boolean
          excluido_at?: string | null
          id?: string
          logo_url?: string
          nome?: string
          programa_id?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_final?: string
          excluido?: boolean
          excluido_at?: string | null
          id?: string
          logo_url?: string
          nome?: string
          programa_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "logos_patrocinadores_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "programas"
            referencedColumns: ["id"]
          },
        ]
      }
      music_likes: {
        Row: {
          artista: string
          capa: string | null
          created_at: string
          id: string
          radio_user_id: string | null
          titulo: string
          user_id: string
        }
        Insert: {
          artista: string
          capa?: string | null
          created_at?: string
          id?: string
          radio_user_id?: string | null
          titulo: string
          user_id: string
        }
        Update: {
          artista?: string
          capa?: string | null
          created_at?: string
          id?: string
          radio_user_id?: string | null
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      music_likes_youtube_cache: {
        Row: {
          artista: string
          created_at: string
          id: string
          thumbnail: string
          titulo: string
          user_id: string
          video_id: string
        }
        Insert: {
          artista: string
          created_at?: string
          id?: string
          thumbnail?: string
          titulo: string
          user_id: string
          video_id: string
        }
        Update: {
          artista?: string
          created_at?: string
          id?: string
          thumbnail?: string
          titulo?: string
          user_id?: string
          video_id?: string
        }
        Relationships: []
      }
      musicas_tocadas: {
        Row: {
          artista: string
          created_at: string
          dia: string
          horario: string
          id: string
          musica: string
          programa: string
          user_id: string
        }
        Insert: {
          artista?: string
          created_at?: string
          dia?: string
          horario?: string
          id?: string
          musica?: string
          programa?: string
          user_id: string
        }
        Update: {
          artista?: string
          created_at?: string
          dia?: string
          horario?: string
          id?: string
          musica?: string
          programa?: string
          user_id?: string
        }
        Relationships: []
      }
      news_cache: {
        Row: {
          items: Json
          last_error: string | null
          site_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          items?: Json
          last_error?: string | null
          site_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          items?: Json
          last_error?: string | null
          site_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_cache_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: true
            referencedRelation: "custom_news_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      ouvintes: {
        Row: {
          banido: boolean
          banido_at: string | null
          banido_motivo: string | null
          cidade: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          escolaridade: string | null
          id: string
          nome: string
          origem_cadastro: string
          pontuacao: number | null
          renda: string | null
          setor: string | null
          sexo: string | null
          telefone: string | null
          updated_at: string
          user_id: string
          whatsapp_message_id: string | null
        }
        Insert: {
          banido?: boolean
          banido_at?: string | null
          banido_motivo?: string | null
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          escolaridade?: string | null
          id?: string
          nome: string
          origem_cadastro?: string
          pontuacao?: number | null
          renda?: string | null
          setor?: string | null
          sexo?: string | null
          telefone?: string | null
          updated_at?: string
          user_id: string
          whatsapp_message_id?: string | null
        }
        Update: {
          banido?: boolean
          banido_at?: string | null
          banido_motivo?: string | null
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          escolaridade?: string | null
          id?: string
          nome?: string
          origem_cadastro?: string
          pontuacao?: number | null
          renda?: string | null
          setor?: string | null
          sexo?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_message_id?: string | null
        }
        Relationships: []
      }
      planos: {
        Row: {
          created_at: string
          enabled_modules: string[] | null
          id: string
          image_url: string | null
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled_modules?: string[] | null
          id?: string
          image_url?: string | null
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled_modules?: string[] | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      player_chat_messages: {
        Row: {
          channel_id: string
          cidade: string
          created_at: string
          id: string
          message: string
          nome: string
        }
        Insert: {
          channel_id: string
          cidade: string
          created_at?: string
          id?: string
          message: string
          nome: string
        }
        Update: {
          channel_id?: string
          cidade?: string
          created_at?: string
          id?: string
          message?: string
          nome?: string
        }
        Relationships: []
      }
      player_heartbeats: {
        Row: {
          last_seen: string
          master_user_id: string
          session_id: string
        }
        Insert: {
          last_seen?: string
          master_user_id: string
          session_id: string
        }
        Update: {
          last_seen?: string
          master_user_id?: string
          session_id?: string
        }
        Relationships: []
      }
      player_listener_profiles: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          cidade: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          estado: string | null
          id: string
          nome: string | null
          radio_user_id: string
          setor: string | null
          sexo: string | null
          sub_profiles: Json
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          id?: string
          nome?: string | null
          radio_user_id: string
          setor?: string | null
          sexo?: string | null
          sub_profiles?: Json
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          id?: string
          nome?: string | null
          radio_user_id?: string
          setor?: string | null
          sexo?: string | null
          sub_profiles?: Json
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      preset_commands: {
        Row: {
          commands: Json
          created_at: string
          custom_horario: string | null
          id: string
          programa_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          commands?: Json
          created_at?: string
          custom_horario?: string | null
          id?: string
          programa_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          commands?: Json
          created_at?: string
          custom_horario?: string | null
          id?: string
          programa_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_enabled: boolean | null
          avatar_url: string | null
          cidade: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          estado: string | null
          event_types_config: Json | null
          id: string
          journalistic_prompt: string | null
          nome: string | null
          pais: string | null
          setor: string | null
          sexo: string | null
          sub_profiles: Json
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          ai_enabled?: boolean | null
          avatar_url?: string | null
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          event_types_config?: Json | null
          id?: string
          journalistic_prompt?: string | null
          nome?: string | null
          pais?: string | null
          setor?: string | null
          sexo?: string | null
          sub_profiles?: Json
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          ai_enabled?: boolean | null
          avatar_url?: string | null
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          estado?: string | null
          event_types_config?: Json | null
          id?: string
          journalistic_prompt?: string | null
          nome?: string | null
          pais?: string | null
          setor?: string | null
          sexo?: string | null
          sub_profiles?: Json
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      programa_automacoes: {
        Row: {
          ativo: boolean
          briefing: string
          created_at: string
          dias_semana: string[]
          horario: string
          id: string
          programa_id: string
          sites_source: string[]
          updated_at: string
          use_custom_news_sites: boolean
          user_id: string
        }
        Insert: {
          ativo?: boolean
          briefing?: string
          created_at?: string
          dias_semana?: string[]
          horario?: string
          id?: string
          programa_id: string
          sites_source?: string[]
          updated_at?: string
          use_custom_news_sites?: boolean
          user_id: string
        }
        Update: {
          ativo?: boolean
          briefing?: string
          created_at?: string
          dias_semana?: string[]
          horario?: string
          id?: string
          programa_id?: string
          sites_source?: string[]
          updated_at?: string
          use_custom_news_sites?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "programa_automacoes_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "programas"
            referencedColumns: ["id"]
          },
        ]
      }
      programas: {
        Row: {
          apresentador_id: string | null
          apresentadores_ids: string[] | null
          ativo: boolean
          capa: string | null
          classificacao_etaria: string | null
          created_at: string
          data_variavel: string | null
          deleted_at: string | null
          descricao: string | null
          dias_semana: string[] | null
          estudio: string | null
          horario_fim: string
          horario_inicio: string
          id: string
          nome: string
          selo: string | null
          thumb: string | null
          tipo_programa: string | null
          user_id: string
          variavel: boolean
        }
        Insert: {
          apresentador_id?: string | null
          apresentadores_ids?: string[] | null
          ativo?: boolean
          capa?: string | null
          classificacao_etaria?: string | null
          created_at?: string
          data_variavel?: string | null
          deleted_at?: string | null
          descricao?: string | null
          dias_semana?: string[] | null
          estudio?: string | null
          horario_fim: string
          horario_inicio: string
          id?: string
          nome: string
          selo?: string | null
          thumb?: string | null
          tipo_programa?: string | null
          user_id: string
          variavel?: boolean
        }
        Update: {
          apresentador_id?: string | null
          apresentadores_ids?: string[] | null
          ativo?: boolean
          capa?: string | null
          classificacao_etaria?: string | null
          created_at?: string
          data_variavel?: string | null
          deleted_at?: string | null
          descricao?: string | null
          dias_semana?: string[] | null
          estudio?: string | null
          horario_fim?: string
          horario_inicio?: string
          id?: string
          nome?: string
          selo?: string | null
          thumb?: string | null
          tipo_programa?: string | null
          user_id?: string
          variavel?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "programas_apresentador_id_fkey"
            columns: ["apresentador_id"]
            isOneToOne: false
            referencedRelation: "apresentadores"
            referencedColumns: ["id"]
          },
        ]
      }
      promocoes: {
        Row: {
          banner_l_url: string | null
          botao_url: string | null
          created_at: string
          data_fim: string
          data_inicio: string
          id: string
          imagem_url: string | null
          nome: string | null
          oferecimento: string | null
          programa_ids: string[] | null
          texto: string
          user_id: string
        }
        Insert: {
          banner_l_url?: string | null
          botao_url?: string | null
          created_at?: string
          data_fim: string
          data_inicio: string
          id?: string
          imagem_url?: string | null
          nome?: string | null
          oferecimento?: string | null
          programa_ids?: string[] | null
          texto?: string
          user_id: string
        }
        Update: {
          banner_l_url?: string | null
          botao_url?: string | null
          created_at?: string
          data_fim?: string
          data_inicio?: string
          id?: string
          imagem_url?: string | null
          nome?: string | null
          oferecimento?: string | null
          programa_ids?: string[] | null
          texto?: string
          user_id?: string
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          content: string
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quiz_agendados: {
        Row: {
          created_at: string
          data_quiz: string
          explicacao: string
          horario_fim: string
          horario_inicio: string
          id: string
          imagem_resposta: string
          pergunta: string
          resposta_correta: number
          resposta1: string
          resposta2: string
          resposta3: string
          resposta4: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_quiz: string
          explicacao?: string
          horario_fim: string
          horario_inicio: string
          id?: string
          imagem_resposta?: string
          pergunta?: string
          resposta_correta?: number
          resposta1?: string
          resposta2?: string
          resposta3?: string
          resposta4?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_quiz?: string
          explicacao?: string
          horario_fim?: string
          horario_inicio?: string
          id?: string
          imagem_resposta?: string
          pergunta?: string
          resposta_correta?: number
          resposta1?: string
          resposta2?: string
          resposta3?: string
          resposta4?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      roteiros: {
        Row: {
          agendado_para_envio: string | null
          apresentador_editado: boolean | null
          configuracoes: Json | null
          conteudo_html: string
          created_at: string
          data_programa: string
          editado_at: string | null
          enviado_agendamento: boolean | null
          estudio: string
          horario: string
          id: string
          numero_roteiro: number | null
          participantes: Json
          programa_nome: string
          share_login: string | null
          share_token: string | null
          status: string
          subtitulo: string
          tickertitulos: string | null
          tipo_programa: string
          titulo: string
          updated_at: string
          user_id: string
          xml_pushed_at: string | null
        }
        Insert: {
          agendado_para_envio?: string | null
          apresentador_editado?: boolean | null
          configuracoes?: Json | null
          conteudo_html?: string
          created_at?: string
          data_programa?: string
          editado_at?: string | null
          enviado_agendamento?: boolean | null
          estudio?: string
          horario?: string
          id?: string
          numero_roteiro?: number | null
          participantes?: Json
          programa_nome?: string
          share_login?: string | null
          share_token?: string | null
          status?: string
          subtitulo?: string
          tickertitulos?: string | null
          tipo_programa?: string
          titulo?: string
          updated_at?: string
          user_id: string
          xml_pushed_at?: string | null
        }
        Update: {
          agendado_para_envio?: string | null
          apresentador_editado?: boolean | null
          configuracoes?: Json | null
          conteudo_html?: string
          created_at?: string
          data_programa?: string
          editado_at?: string | null
          enviado_agendamento?: boolean | null
          estudio?: string
          horario?: string
          id?: string
          numero_roteiro?: number | null
          participantes?: Json
          programa_nome?: string
          share_login?: string | null
          share_token?: string | null
          status?: string
          subtitulo?: string
          tickertitulos?: string | null
          tipo_programa?: string
          titulo?: string
          updated_at?: string
          user_id?: string
          xml_pushed_at?: string | null
        }
        Relationships: []
      }
      selected_cotacoes: {
        Row: {
          change: string
          created_at: string
          id: string
          name: string
          user_id: string
          value: string
        }
        Insert: {
          change: string
          created_at?: string
          id?: string
          name: string
          user_id: string
          value: string
        }
        Update: {
          change?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
          value?: string
        }
        Relationships: []
      }
      selected_news: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          portal: string
          resumo: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          portal: string
          resumo?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          portal?: string
          resumo?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      shopping_products: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          payment_url: string | null
          price: number
          program_id: string | null
          stock: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          payment_url?: string | null
          price?: number
          program_id?: string | null
          stock?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          payment_url?: string | null
          price?: number
          program_id?: string | null
          stock?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_products_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programas"
            referencedColumns: ["id"]
          },
        ]
      }
      site_banners: {
        Row: {
          ativo: boolean
          created_at: string
          data_final: string | null
          data_inicial: string | null
          id: string
          image_url: string
          link_url: string | null
          nome: string
          posicao: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_final?: string | null
          data_inicial?: string | null
          id?: string
          image_url: string
          link_url?: string | null
          nome: string
          posicao?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_final?: string | null
          data_inicial?: string | null
          id?: string
          image_url?: string
          link_url?: string | null
          nome?: string
          posicao?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_categorias: {
        Row: {
          cor: string | null
          created_at: string
          id: string
          nome: string
          ordem: number
          slug: string
          user_id: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          slug: string
          user_id: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          slug?: string
          user_id?: string
        }
        Relationships: []
      }
      site_config: {
        Row: {
          cidade_clima: string | null
          cidade_lat: number | null
          cidade_lon: number | null
          cor_primaria: string | null
          favicon_url: string | null
          fonte_noticias: string
          logo_url: string | null
          meta_description: string | null
          meta_keywords: string | null
          og_image_url: string | null
          show_clima: boolean
          show_economia: boolean
          show_grade: boolean
          show_no_ar: boolean
          show_noticias: boolean
          show_promocoes: boolean
          site_descricao: string | null
          site_dominio: string | null
          site_nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cidade_clima?: string | null
          cidade_lat?: number | null
          cidade_lon?: number | null
          cor_primaria?: string | null
          favicon_url?: string | null
          fonte_noticias?: string
          logo_url?: string | null
          meta_description?: string | null
          meta_keywords?: string | null
          og_image_url?: string | null
          show_clima?: boolean
          show_economia?: boolean
          show_grade?: boolean
          show_no_ar?: boolean
          show_noticias?: boolean
          show_promocoes?: boolean
          site_descricao?: string | null
          site_dominio?: string | null
          site_nome?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cidade_clima?: string | null
          cidade_lat?: number | null
          cidade_lon?: number | null
          cor_primaria?: string | null
          favicon_url?: string | null
          fonte_noticias?: string
          logo_url?: string | null
          meta_description?: string | null
          meta_keywords?: string | null
          og_image_url?: string | null
          show_clima?: boolean
          show_economia?: boolean
          show_grade?: boolean
          show_no_ar?: boolean
          show_noticias?: boolean
          show_promocoes?: boolean
          site_descricao?: string | null
          site_dominio?: string | null
          site_nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      site_deploy_config: {
        Row: {
          auto_publish: boolean
          host: string
          password: string
          port: number
          protocol: string
          remote_path: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          auto_publish?: boolean
          host?: string
          password?: string
          port?: number
          protocol?: string
          remote_path?: string
          updated_at?: string
          user_id: string
          username?: string
        }
        Update: {
          auto_publish?: boolean
          host?: string
          password?: string
          port?: number
          protocol?: string
          remote_path?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      site_deploy_history: {
        Row: {
          bytes_sent: number | null
          created_at: string
          duration_ms: number | null
          files_count: number | null
          id: string
          message: string | null
          status: string
          user_id: string
        }
        Insert: {
          bytes_sent?: number | null
          created_at?: string
          duration_ms?: number | null
          files_count?: number | null
          id?: string
          message?: string | null
          status: string
          user_id: string
        }
        Update: {
          bytes_sent?: number | null
          created_at?: string
          duration_ms?: number | null
          files_count?: number | null
          id?: string
          message?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      site_noticias: {
        Row: {
          categoria_id: string | null
          conteudo: string | null
          created_at: string
          id: string
          imagem_url: string | null
          publicado: boolean
          resumo: string | null
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          categoria_id?: string | null
          conteudo?: string | null
          created_at?: string
          id?: string
          imagem_url?: string | null
          publicado?: boolean
          resumo?: string | null
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          categoria_id?: string | null
          conteudo?: string | null
          created_at?: string
          id?: string
          imagem_url?: string | null
          publicado?: boolean
          resumo?: string | null
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_noticias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "site_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      sorteio_premio_programas: {
        Row: {
          created_at: string
          id: string
          premio_id: string
          programa_id: string
          quantidade: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          premio_id: string
          programa_id: string
          quantidade?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          premio_id?: string
          programa_id?: string
          quantidade?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sorteio_premio_programas_premio_id_fkey"
            columns: ["premio_id"]
            isOneToOne: false
            referencedRelation: "sorteio_premios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sorteio_premio_programas_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "programas"
            referencedColumns: ["id"]
          },
        ]
      }
      sorteio_premios: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          dias_validade: number
          id: string
          imagem_url: string | null
          nome: string
          programa_id: string | null
          quantidade_estoque: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          dias_validade?: number
          id?: string
          imagem_url?: string | null
          nome: string
          programa_id?: string | null
          quantidade_estoque?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          dias_validade?: number
          id?: string
          imagem_url?: string | null
          nome?: string
          programa_id?: string | null
          quantidade_estoque?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sorteio_premios_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "programas"
            referencedColumns: ["id"]
          },
        ]
      }
      sorteio_sorteios: {
        Row: {
          apresentador_nome: string | null
          created_at: string
          data_entrega: string | null
          data_expiracao: string | null
          data_sorteio: string
          entrega_pin: string | null
          entrega_registrada_em: string | null
          entrega_token: string
          entregue: boolean
          expirado: boolean
          foto_entrega_url: string | null
          id: string
          nome_ganhador: string
          observacoes: string | null
          ouvinte_id: string | null
          premio_id: string
          programa_id: string | null
          programa_nome: string | null
          telefone_ganhador: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          apresentador_nome?: string | null
          created_at?: string
          data_entrega?: string | null
          data_expiracao?: string | null
          data_sorteio?: string
          entrega_pin?: string | null
          entrega_registrada_em?: string | null
          entrega_token?: string
          entregue?: boolean
          expirado?: boolean
          foto_entrega_url?: string | null
          id?: string
          nome_ganhador: string
          observacoes?: string | null
          ouvinte_id?: string | null
          premio_id: string
          programa_id?: string | null
          programa_nome?: string | null
          telefone_ganhador?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          apresentador_nome?: string | null
          created_at?: string
          data_entrega?: string | null
          data_expiracao?: string | null
          data_sorteio?: string
          entrega_pin?: string | null
          entrega_registrada_em?: string | null
          entrega_token?: string
          entregue?: boolean
          expirado?: boolean
          foto_entrega_url?: string | null
          id?: string
          nome_ganhador?: string
          observacoes?: string | null
          ouvinte_id?: string | null
          premio_id?: string
          programa_id?: string | null
          programa_nome?: string | null
          telefone_ganhador?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sorteio_sorteios_ouvinte_id_fkey"
            columns: ["ouvinte_id"]
            isOneToOne: false
            referencedRelation: "ouvintes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sorteio_sorteios_premio_id_fkey"
            columns: ["premio_id"]
            isOneToOne: false
            referencedRelation: "sorteio_premios"
            referencedColumns: ["id"]
          },
        ]
      }
      streaming_channels: {
        Row: {
          active: boolean
          background_url: string | null
          catalog_name: string | null
          classificacao_etaria: string | null
          cover_url: string | null
          created_at: string
          descricao: string | null
          estudio: string | null
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          is_hd: boolean | null
          is_stereo: boolean | null
          logo_url: string | null
          name: string
          numero_canal: string | null
          type: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          active?: boolean
          background_url?: string | null
          catalog_name?: string | null
          classificacao_etaria?: string | null
          cover_url?: string | null
          created_at?: string
          descricao?: string | null
          estudio?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          is_hd?: boolean | null
          is_stereo?: boolean | null
          logo_url?: string | null
          name: string
          numero_canal?: string | null
          type?: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          active?: boolean
          background_url?: string | null
          catalog_name?: string | null
          classificacao_etaria?: string | null
          cover_url?: string | null
          created_at?: string
          descricao?: string | null
          estudio?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          is_hd?: boolean | null
          is_stereo?: boolean | null
          logo_url?: string | null
          name?: string
          numero_canal?: string | null
          type?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      sub_users: {
        Row: {
          allowed_modules: string[]
          ativo: boolean
          auth_user_id: string
          created_at: string
          email: string
          id: string
          nome: string
          parent_user_id: string
          updated_at: string
        }
        Insert: {
          allowed_modules?: string[]
          ativo?: boolean
          auth_user_id: string
          created_at?: string
          email: string
          id?: string
          nome?: string
          parent_user_id: string
          updated_at?: string
        }
        Update: {
          allowed_modules?: string[]
          ativo?: boolean
          auth_user_id?: string
          created_at?: string
          email?: string
          id?: string
          nome?: string
          parent_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      teleprompters: {
        Row: {
          ativo: boolean
          created_at: string
          estudio: string
          id: string
          is_html: boolean | null
          last_seen: string | null
          nome: string
          texto_atual: string | null
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          estudio?: string
          id?: string
          is_html?: boolean | null
          last_seen?: string | null
          nome?: string
          texto_atual?: string | null
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          estudio?: string
          id?: string
          is_html?: boolean | null
          last_seen?: string | null
          nome?: string
          texto_atual?: string | null
          user_id?: string
        }
        Relationships: []
      }
      testemunhais: {
        Row: {
          created_at: string
          data_fim: string
          data_inicio: string
          id: string
          imagem_url: string | null
          programa_id: string | null
          programa_ids: string[] | null
          texto: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          data_fim: string
          data_inicio: string
          id?: string
          imagem_url?: string | null
          programa_id?: string | null
          programa_ids?: string[] | null
          texto?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          data_fim?: string
          data_inicio?: string
          id?: string
          imagem_url?: string | null
          programa_id?: string | null
          programa_ids?: string[] | null
          texto?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "testemunhais_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "programas"
            referencedColumns: ["id"]
          },
        ]
      }
      transcricoes_streaming: {
        Row: {
          created_at: string
          id: string
          texto_transcrito: string
          timestamp_fim: string
          timestamp_inicio: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          texto_transcrito: string
          timestamp_fim?: string
          timestamp_inicio?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          texto_transcrito?: string
          timestamp_fim?: string
          timestamp_inicio?: string
          user_id?: string
        }
        Relationships: []
      }
      tv_pairing_codes: {
        Row: {
          claimed_at: string | null
          code: string
          created_at: string
          expires_at: string
          paired_avatar: string | null
          paired_email: string | null
          paired_name: string | null
          paired_user_id: string | null
          slug_user_id: string
          status: string
          tv_session_id: string
          user_slug: string
        }
        Insert: {
          claimed_at?: string | null
          code: string
          created_at?: string
          expires_at?: string
          paired_avatar?: string | null
          paired_email?: string | null
          paired_name?: string | null
          paired_user_id?: string | null
          slug_user_id: string
          status?: string
          tv_session_id: string
          user_slug: string
        }
        Update: {
          claimed_at?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          paired_avatar?: string | null
          paired_email?: string | null
          paired_name?: string | null
          paired_user_id?: string | null
          slug_user_id?: string
          status?: string
          tv_session_id?: string
          user_slug?: string
        }
        Relationships: []
      }
      tv_pairing_events: {
        Row: {
          code: string | null
          created_at: string
          event_type: string
          id: string
          ip: string | null
          meta: Json
          paired_email: string | null
          paired_user_id: string | null
          reason: string | null
          slug_user_id: string | null
          tv_session_id: string | null
          user_agent: string | null
          user_slug: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          event_type: string
          id?: string
          ip?: string | null
          meta?: Json
          paired_email?: string | null
          paired_user_id?: string | null
          reason?: string | null
          slug_user_id?: string | null
          tv_session_id?: string | null
          user_agent?: string | null
          user_slug?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip?: string | null
          meta?: Json
          paired_email?: string | null
          paired_user_id?: string | null
          reason?: string | null
          slug_user_id?: string | null
          tv_session_id?: string | null
          user_agent?: string | null
          user_slug?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          cenario_config: Json | null
          dashboard_items: Json | null
          id: string
          infomusic_ai_enabled: boolean
          infomusic_ai_last_reset: string | null
          infomusic_ai_monthly_count: number | null
          infomusic_excecoes: string | null
          infomusic_excecoes_artista_url: string | null
          infomusic_excecoes_capa_url: string | null
          last_manual_curiosity_id: string | null
          music_source_device: string | null
          music_source_mode: string
          music_xml_url: string | null
          shopping_active: boolean
          updated_at: string
          user_id: string
          vmix_input_mapping: Json | null
          vmix_pass: string | null
          vmix_shortcuts: Json | null
          vmix_url: string | null
          vmix_user: string | null
          weather_city: string | null
          weather_lat: number | null
          weather_lon: number | null
        }
        Insert: {
          cenario_config?: Json | null
          dashboard_items?: Json | null
          id?: string
          infomusic_ai_enabled?: boolean
          infomusic_ai_last_reset?: string | null
          infomusic_ai_monthly_count?: number | null
          infomusic_excecoes?: string | null
          infomusic_excecoes_artista_url?: string | null
          infomusic_excecoes_capa_url?: string | null
          last_manual_curiosity_id?: string | null
          music_source_device?: string | null
          music_source_mode?: string
          music_xml_url?: string | null
          shopping_active?: boolean
          updated_at?: string
          user_id: string
          vmix_input_mapping?: Json | null
          vmix_pass?: string | null
          vmix_shortcuts?: Json | null
          vmix_url?: string | null
          vmix_user?: string | null
          weather_city?: string | null
          weather_lat?: number | null
          weather_lon?: number | null
        }
        Update: {
          cenario_config?: Json | null
          dashboard_items?: Json | null
          id?: string
          infomusic_ai_enabled?: boolean
          infomusic_ai_last_reset?: string | null
          infomusic_ai_monthly_count?: number | null
          infomusic_excecoes?: string | null
          infomusic_excecoes_artista_url?: string | null
          infomusic_excecoes_capa_url?: string | null
          last_manual_curiosity_id?: string | null
          music_source_device?: string | null
          music_source_mode?: string
          music_xml_url?: string | null
          shopping_active?: boolean
          updated_at?: string
          user_id?: string
          vmix_input_mapping?: Json | null
          vmix_pass?: string | null
          vmix_shortcuts?: Json | null
          vmix_url?: string | null
          vmix_user?: string | null
          weather_city?: string | null
          weather_lat?: number | null
          weather_lon?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_last_manual_curiosity_id_fkey"
            columns: ["last_manual_curiosity_id"]
            isOneToOne: false
            referencedRelation: "infomusic"
            referencedColumns: ["id"]
          },
        ]
      }
      vmix_bridge_devices: {
        Row: {
          created_at: string
          device_name: string
          id: string
          last_seen_at: string | null
          revoked: boolean
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string
          id?: string
          last_seen_at?: string | null
          revoked?: boolean
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string
          id?: string
          last_seen_at?: string | null
          revoked?: boolean
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      vmix_bridge_jobs: {
        Row: {
          body: Json | null
          completed_at: string | null
          created_at: string
          device_id: string
          id: string
          method: string
          path: string
          result_body: string | null
          result_status: number | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          body?: Json | null
          completed_at?: string | null
          created_at?: string
          device_id: string
          id?: string
          method?: string
          path: string
          result_body?: string | null
          result_status?: number | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          body?: Json | null
          completed_at?: string | null
          created_at?: string
          device_id?: string
          id?: string
          method?: string
          path?: string
          result_body?: string | null
          result_status?: number | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vmix_bridge_jobs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "vmix_bridge_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      vmix_bridge_pairings: {
        Row: {
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vmix_button_interactions: {
        Row: {
          button_category: string | null
          button_id: string
          button_name: string
          created_at: string
          id: string
          locutor_nome: string | null
          points: number
          program_name: string | null
          studio_name: string | null
          user_email: string | null
          user_id: string
        }
        Insert: {
          button_category?: string | null
          button_id: string
          button_name: string
          created_at?: string
          id?: string
          locutor_nome?: string | null
          points?: number
          program_name?: string | null
          studio_name?: string | null
          user_email?: string | null
          user_id: string
        }
        Update: {
          button_category?: string | null
          button_id?: string
          button_name?: string
          created_at?: string
          id?: string
          locutor_nome?: string | null
          points?: number
          program_name?: string | null
          studio_name?: string | null
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vmix_connections: {
        Row: {
          created_at: string
          id: string
          is_default: boolean | null
          last_inputs: Json
          last_state: Json
          last_synced_at: string | null
          name: string
          ndi_sources: Json
          password: string | null
          updated_at: string
          url: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean | null
          last_inputs?: Json
          last_state?: Json
          last_synced_at?: string | null
          name: string
          ndi_sources?: Json
          password?: string | null
          updated_at?: string
          url: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean | null
          last_inputs?: Json
          last_state?: Json
          last_synced_at?: string | null
          name?: string
          ndi_sources?: Json
          password?: string | null
          updated_at?: string
          url?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      vmix_switcher_categorias: {
        Row: {
          created_at: string
          estudio: string | null
          icone: string | null
          id: string
          inputs: Json
          nome: string
          ordem: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          estudio?: string | null
          icone?: string | null
          id?: string
          inputs?: Json
          nome?: string
          ordem?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          estudio?: string | null
          icone?: string | null
          id?: string
          inputs?: Json
          nome?: string
          ordem?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wa_broadcasts: {
        Row: {
          audience_filter: Json
          created_at: string
          fail_count: number
          finished_at: string | null
          id: string
          image_url: string | null
          message: string
          name: string
          scheduled_at: string | null
          sent_count: number
          started_at: string | null
          status: string
          total_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          audience_filter?: Json
          created_at?: string
          fail_count?: number
          finished_at?: string | null
          id?: string
          image_url?: string | null
          message: string
          name: string
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          total_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          audience_filter?: Json
          created_at?: string
          fail_count?: number
          finished_at?: string | null
          id?: string
          image_url?: string | null
          message?: string
          name?: string
          scheduled_at?: string | null
          sent_count?: number
          started_at?: string | null
          status?: string
          total_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wa_config: {
        Row: {
          active: boolean
          created_at: string
          display_phone: string | null
          id: string
          phone_number_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_phone?: string | null
          id?: string
          phone_number_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_phone?: string | null
          id?: string
          phone_number_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wa_contacts: {
        Row: {
          blocked: boolean
          created_at: string
          flow_id: string | null
          flow_state: Json
          human_takeover: boolean
          id: string
          last_inbound_at: string | null
          last_message_at: string | null
          name: string | null
          ouvinte_id: string | null
          phone: string
          profile_name: string | null
          tags: string[]
          unread_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked?: boolean
          created_at?: string
          flow_id?: string | null
          flow_state?: Json
          human_takeover?: boolean
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          name?: string | null
          ouvinte_id?: string | null
          phone: string
          profile_name?: string | null
          tags?: string[]
          unread_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked?: boolean
          created_at?: string
          flow_id?: string | null
          flow_state?: Json
          human_takeover?: boolean
          id?: string
          last_inbound_at?: string | null
          last_message_at?: string | null
          name?: string | null
          ouvinte_id?: string | null
          phone?: string
          profile_name?: string | null
          tags?: string[]
          unread_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_contacts_ouvinte_id_fkey"
            columns: ["ouvinte_id"]
            isOneToOne: false
            referencedRelation: "ouvintes"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_flows: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_default: boolean
          name: string
          steps: Json
          trigger: string
          trigger_value: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          steps?: Json
          trigger?: string
          trigger_value?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          steps?: Json
          trigger?: string
          trigger_value?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wa_messages: {
        Row: {
          automation_id: string | null
          body: string | null
          contact_id: string
          created_at: string
          direction: string
          error: string | null
          id: string
          media_url: string | null
          status: string
          type: string
          user_id: string
          wa_message_id: string | null
        }
        Insert: {
          automation_id?: string | null
          body?: string | null
          contact_id: string
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          media_url?: string | null
          status?: string
          type?: string
          user_id: string
          wa_message_id?: string | null
        }
        Update: {
          automation_id?: string | null
          body?: string | null
          contact_id?: string
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          media_url?: string | null
          status?: string
          type?: string
          user_id?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "wa_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_history: {
        Row: {
          channel_cover_url: string | null
          channel_id: string | null
          channel_logo_url: string | null
          channel_name: string
          channel_type: string
          id: string
          radio_user_id: string | null
          user_id: string
          watched_at: string
        }
        Insert: {
          channel_cover_url?: string | null
          channel_id?: string | null
          channel_logo_url?: string | null
          channel_name?: string
          channel_type?: string
          id?: string
          radio_user_id?: string | null
          user_id: string
          watched_at?: string
        }
        Update: {
          channel_cover_url?: string | null
          channel_id?: string | null
          channel_logo_url?: string | null
          channel_name?: string
          channel_type?: string
          id?: string
          radio_user_id?: string | null
          user_id?: string
          watched_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_history_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "streaming_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      xml_upload_history: {
        Row: {
          artista: string | null
          created_at: string
          id: string
          musica: string | null
          source: string
          user_id: string
        }
        Insert: {
          artista?: string | null
          created_at?: string
          id?: string
          musica?: string | null
          source?: string
          user_id: string
        }
        Update: {
          artista?: string | null
          created_at?: string
          id?: string
          musica?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_audiencia_historico: { Args: never; Returns: undefined }
      cleanup_comercial: { Args: never; Returns: undefined }
      cleanup_musicas_tocadas: { Args: never; Returns: undefined }
      cleanup_old_chat_messages: { Args: never; Returns: undefined }
      current_parent_user_id: { Args: never; Returns: string }
      expire_overdue_sorteios: { Args: { _user_id: string }; Returns: number }
      get_music_history_light: {
        Args: { _limit?: number; _user_id: string }
        Returns: {
          artista: string
          created_at: string
          id: string
          musica: string
        }[]
      }
      get_public_broadcast_assuntos: {
        Args: { _programa_id?: string; _user_id: string }
        Returns: {
          bg_color: string
          font_family: string
          mensagens: Json
          mensagens_enabled: boolean[]
          rotation_seconds: number
          text_color: string
          updated_at: string
        }[]
      }
      get_public_cenario_estudio_web: {
        Args: { _id: string }
        Returns: {
          content: Json
          created_at: string
          id: string
          nome: string
          orientation: string
          tv_count: number
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "cenario_estudio_web"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_roteiro_by_share_token: {
        Args: { _token: string }
        Returns: {
          agendado_para_envio: string | null
          apresentador_editado: boolean | null
          configuracoes: Json | null
          conteudo_html: string
          created_at: string
          data_programa: string
          editado_at: string | null
          enviado_agendamento: boolean | null
          estudio: string
          horario: string
          id: string
          numero_roteiro: number | null
          participantes: Json
          programa_nome: string
          share_login: string | null
          share_token: string | null
          status: string
          subtitulo: string
          tickertitulos: string | null
          tipo_programa: string
          titulo: string
          updated_at: string
          user_id: string
          xml_pushed_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "roteiros"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_ouvinte_banido: {
        Args: { _identifier: string; _radio_user_id: string }
        Returns: boolean
      }
      list_roteiros_historico_by_share_token: {
        Args: { _limit?: number; _token: string }
        Returns: {
          agendado_para_envio: string | null
          apresentador_editado: boolean | null
          configuracoes: Json | null
          conteudo_html: string
          created_at: string
          data_programa: string
          editado_at: string | null
          enviado_agendamento: boolean | null
          estudio: string
          horario: string
          id: string
          numero_roteiro: number | null
          participantes: Json
          programa_nome: string
          share_login: string | null
          share_token: string | null
          status: string
          subtitulo: string
          tickertitulos: string | null
          tipo_programa: string
          titulo: string
          updated_at: string
          user_id: string
          xml_pushed_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "roteiros"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      update_roteiro_by_share_token: {
        Args: { _conteudo_html: string; _participantes: Json; _token: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
