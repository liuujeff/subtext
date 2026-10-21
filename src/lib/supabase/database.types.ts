
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "guesses": {
                  Row: {
                    "created_at": string,"guess_no": number,"id": number,"lean": number,"player_id": string,"points": number,"puzzle_id": number,"rank": number,"word": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"guess_no": number,"id"?: never,"lean": number,"player_id": string,"points": number,"puzzle_id": number,"rank": number,"word": string
                  }
                  Update: {
                    "created_at"?: string,"guess_no"?: number,"id"?: never,"lean"?: number,"player_id"?: string,"points"?: number,"puzzle_id"?: number,"rank"?: number,"word"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "guesses_puzzle_id_fkey"
      columns: ["puzzle_id"]
isOneToOne: false
      referencedRelation: "puzzles"
      referencedColumns: ["id"]
    }
                  ]
                },"inflections": {
                  Row: {
                    "base": string,"form": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base": string,"form": string
                  }
                  Update: {
                    "base"?: string,"form"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inflections_base_fkey"
      columns: ["base"]
isOneToOne: false
      referencedRelation: "words"
      referencedColumns: ["word"]
    }
                  ]
                },"puzzles": {
                  Row: {
                    "id": number,"kind": string,"lam": number,"play_date": string | null,"round": number | null,"sorted_scores": (number)[],"top_answers": NonNullable<Json>,"word_a": string,"word_b": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: never,"kind": string,"lam": number,"play_date"?: string | null,"round"?: number | null,"sorted_scores": (number)[],"top_answers": NonNullable<Json>,"word_a": string,"word_b": string
                  }
                  Update: {
                    "id"?: never,"kind"?: string,"lam"?: number,"play_date"?: string | null,"round"?: number | null,"sorted_scores"?: (number)[],"top_answers"?: NonNullable<Json>,"word_a"?: string,"word_b"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "puzzles_word_a_fkey"
      columns: ["word_a"]
isOneToOne: false
      referencedRelation: "words"
      referencedColumns: ["word"]
    },{
      foreignKeyName: "puzzles_word_b_fkey"
      columns: ["word_b"]
isOneToOne: false
      referencedRelation: "words"
      referencedColumns: ["word"]
    }
                  ]
                },"round_starts": {
                  Row: {
                    "player_id": string,"puzzle_id": number,"started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "player_id": string,"puzzle_id": number,"started_at": string
                  }
                  Update: {
                    "player_id"?: string,"puzzle_id"?: number,"started_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "round_starts_puzzle_id_fkey"
      columns: ["puzzle_id"]
isOneToOne: false
      referencedRelation: "puzzles"
      referencedColumns: ["id"]
    }
                  ]
                },"words": {
                  Row: {
                    "embedding": unknown,"freq_rank": number,"hub": number,"id": number,"in_pool": boolean,"word": string
                  }
                  ComputedFields: never
                  Insert: {
                    "embedding": unknown,"freq_rank": number,"hub": number,"id": number,"in_pool": boolean,"word": string
                  }
                  Update: {
                    "embedding"?: unknown,"freq_rank"?: number,"hub"?: number,"id"?: number,"in_pool"?: boolean,"word"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "score_guess":
{ Args: { "p_puzzle_id": number,"p_word": string }; Returns: {
              "lean": number,"objective": number,"rank": number
            }[]
                           },
"suggest_words":
{ Args: { "p_limit"?: number,"p_word": string }; Returns: {
              "distance": number,"word": string
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
