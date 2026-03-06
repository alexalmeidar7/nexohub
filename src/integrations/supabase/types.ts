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
          created_at: string
          data: string
          descricao: string | null
          id: string
          local: string
          prioridade: string
          programa_id: string | null
          recorrencia: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data: string
          descricao?: string | null
          id?: string
          local?: string
          prioridade?: string
          programa_id?: string | null
          recorrencia?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: string
          descricao?: string | null
          id?: string
          local?: string
          prioridade?: string
          programa_id?: string | null
          recorrencia?: string
          user_id?: string
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
      comercial_preroll: {
        Row: {
          active: boolean
          created_at: string
          data_final: string | null
          data_inicial: string | null
          dias_semana: string[] | null
          horario_fim: string
          horario_inicio: string
          id: string
          link_url: string | null
          media_type: string
          priority: number
          skip_enabled: boolean
          updated_at: string
          user_id: string
          video_url: string
          youtube_url: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          data_final?: string | null
          data_inicial?: string | null
          dias_semana?: string[] | null
          horario_fim: string
          horario_inicio: string
          id?: string
          link_url?: string | null
          media_type?: string
          priority?: number
          skip_enabled?: boolean
          updated_at?: string
          user_id: string
          video_url?: string
          youtube_url?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          data_final?: string | null
          data_inicial?: string | null
          dias_semana?: string[] | null
          horario_fim?: string
          horario_inicio?: string
          id?: string
          link_url?: string | null
          media_type?: string
          priority?: number
          skip_enabled?: boolean
          updated_at?: string
          user_id?: string
          video_url?: string
          youtube_url?: string | null
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
      escalada_news: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          portal: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          portal: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          portal?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      logos_patrocinadores: {
        Row: {
          ativo: boolean
          created_at: string
          data_final: string
          id: string
          logo_url: string
          programa_id: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_final: string
          id?: string
          logo_url?: string
          programa_id: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_final?: string
          id?: string
          logo_url?: string
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
      programas: {
        Row: {
          apresentador_id: string | null
          ativo: boolean
          capa: string | null
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
          user_id: string
          variavel: boolean
        }
        Insert: {
          apresentador_id?: string | null
          ativo?: boolean
          capa?: string | null
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
          user_id: string
          variavel?: boolean
        }
        Update: {
          apresentador_id?: string | null
          ativo?: boolean
          capa?: string | null
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
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          portal: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          portal?: string
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
      streaming_channels: {
        Row: {
          active: boolean
          background_url: string | null
          cover_url: string | null
          created_at: string
          id: string
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
          cover_url?: string | null
          created_at?: string
          id?: string
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
          cover_url?: string | null
          created_at?: string
          id?: string
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
          id: string
          music_xml_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          music_xml_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          music_xml_url?: string | null
          updated_at?: string
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
      cleanup_old_chat_messages: { Args: never; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
