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
          horario_gravacao: string | null
          horario_gravacao_fim: string | null
          id: string
          local: string
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
          horario_gravacao?: string | null
          horario_gravacao_fim?: string | null
          id?: string
          local?: string
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
          horario_gravacao?: string | null
          horario_gravacao_fim?: string | null
          id?: string
          local?: string
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
          cargo: string | null
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
          cargo?: string | null
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
          cargo?: string | null
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
          created_at: string
          id: string
          name: string
          rss_url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          rss_url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          rss_url?: string
          user_id?: string
        }
        Relationships: []
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
          horario: string | null
          id: string
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          commands?: Json
          created_at?: string
          data_especifica?: string | null
          dias_semana?: string[] | null
          horario?: string | null
          id?: string
          nome?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          commands?: Json
          created_at?: string
          data_especifica?: string | null
          dias_semana?: string[] | null
          horario?: string | null
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      empresa_config: {
        Row: {
          ativo: boolean
          background_url: string | null
          endereco: string | null
          facebook: string | null
          id: string
          instagram: string | null
          logo: string | null
          nome: string | null
          plano: string
          site: string | null
          telefone_comercial: string | null
          telefone_participacao: string | null
          updated_at: string
          user_id: string
          youtube: string | null
        }
        Insert: {
          ativo?: boolean
          background_url?: string | null
          endereco?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          logo?: string | null
          nome?: string | null
          plano?: string
          site?: string | null
          telefone_comercial?: string | null
          telefone_participacao?: string | null
          updated_at?: string
          user_id: string
          youtube?: string | null
        }
        Update: {
          ativo?: boolean
          background_url?: string | null
          endereco?: string | null
          facebook?: string | null
          id?: string
          instagram?: string | null
          logo?: string | null
          nome?: string | null
          plano?: string
          site?: string | null
          telefone_comercial?: string | null
          telefone_participacao?: string | null
          updated_at?: string
          user_id?: string
          youtube?: string | null
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
          programa_id: string
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
          programa_id: string
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
          programa_id?: string
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
          titulo: string
          user_id: string
        }
        Insert: {
          artista: string
          capa?: string | null
          created_at?: string
          id?: string
          titulo: string
          user_id: string
        }
        Update: {
          artista?: string
          capa?: string | null
          created_at?: string
          id?: string
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
      ouvintes: {
        Row: {
          cidade: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          escolaridade: string | null
          id: string
          nome: string
          pontuacao: number | null
          renda: string | null
          setor: string | null
          sexo: string | null
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          escolaridade?: string | null
          id?: string
          nome: string
          pontuacao?: number | null
          renda?: string | null
          setor?: string | null
          sexo?: string | null
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cidade?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          escolaridade?: string | null
          id?: string
          nome?: string
          pontuacao?: number | null
          renda?: string | null
          setor?: string | null
          sexo?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
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
          created_at: string
          email: string | null
          estado: string | null
          event_types_config: Json | null
          id: string
          journalistic_prompt: string | null
          nome: string | null
          pais: string | null
          sexo: string | null
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          ai_enabled?: boolean | null
          avatar_url?: string | null
          cidade?: string | null
          created_at?: string
          email?: string | null
          estado?: string | null
          event_types_config?: Json | null
          id?: string
          journalistic_prompt?: string | null
          nome?: string | null
          pais?: string | null
          sexo?: string | null
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          ai_enabled?: boolean | null
          avatar_url?: string | null
          cidade?: string | null
          created_at?: string
          email?: string | null
          estado?: string | null
          event_types_config?: Json | null
          id?: string
          journalistic_prompt?: string | null
          nome?: string | null
          pais?: string | null
          sexo?: string | null
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
          oferecimento: string | null
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
          oferecimento?: string | null
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
          oferecimento?: string | null
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
          apresentador_editado: boolean | null
          configuracoes: Json | null
          conteudo_html: string
          created_at: string
          data_programa: string
          editado_at: string | null
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
          apresentador_editado?: boolean | null
          configuracoes?: Json | null
          conteudo_html?: string
          created_at?: string
          data_programa?: string
          editado_at?: string | null
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
          apresentador_editado?: boolean | null
          configuracoes?: Json | null
          conteudo_html?: string
          created_at?: string
          data_programa?: string
          editado_at?: string | null
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
          fonte_noticias: string
          show_clima: boolean
          show_economia: boolean
          show_grade: boolean
          show_no_ar: boolean
          show_noticias: boolean
          show_promocoes: boolean
          site_descricao: string | null
          site_nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cidade_clima?: string | null
          cidade_lat?: number | null
          cidade_lon?: number | null
          cor_primaria?: string | null
          fonte_noticias?: string
          show_clima?: boolean
          show_economia?: boolean
          show_grade?: boolean
          show_no_ar?: boolean
          show_noticias?: boolean
          show_promocoes?: boolean
          site_descricao?: string | null
          site_nome?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cidade_clima?: string | null
          cidade_lat?: number | null
          cidade_lon?: number | null
          cor_primaria?: string | null
          fonte_noticias?: string
          show_clima?: boolean
          show_economia?: boolean
          show_grade?: boolean
          show_no_ar?: boolean
          show_noticias?: boolean
          show_promocoes?: boolean
          site_descricao?: string | null
          site_nome?: string
          updated_at?: string
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
          texto: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_fim: string
          data_inicio: string
          id?: string
          imagem_url?: string | null
          programa_id?: string | null
          texto?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_fim?: string
          data_inicio?: string
          id?: string
          imagem_url?: string | null
          programa_id?: string | null
          texto?: string
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
          last_manual_curiosity_id: string | null
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
          last_manual_curiosity_id?: string | null
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
          last_manual_curiosity_id?: string | null
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
      vmix_connections: {
        Row: {
          created_at: string
          id: string
          is_default: boolean | null
          name: string
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
          name: string
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
          name?: string
          password?: string | null
          updated_at?: string
          url?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      watch_history: {
        Row: {
          channel_cover_url: string | null
          channel_id: string | null
          channel_logo_url: string | null
          channel_name: string
          channel_type: string
          id: string
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
          created_at: string
          id: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
      cleanup_comercial: { Args: never; Returns: undefined }
      cleanup_infomusic: { Args: never; Returns: undefined }
      cleanup_musicas_tocadas: { Args: never; Returns: undefined }
      cleanup_old_chat_messages: { Args: never; Returns: undefined }
      get_roteiro_by_share_token: {
        Args: { _token: string }
        Returns: {
          apresentador_editado: boolean | null
          configuracoes: Json | null
          conteudo_html: string
          created_at: string
          data_programa: string
          editado_at: string | null
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
      list_roteiros_historico_by_share_token: {
        Args: { _limit?: number; _token: string }
        Returns: {
          apresentador_editado: boolean | null
          configuracoes: Json | null
          conteudo_html: string
          created_at: string
          data_programa: string
          editado_at: string | null
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
