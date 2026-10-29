import { createClient } from "@supabase/supabase-js";
import type { SavedPerson } from "@/features/people/model";
import { configError, supabaseUrl, supabaseKey } from "./configuration";

type Database = {
    public: {
        Tables: {
            people: {
                Row: SavedPerson;
                Insert: Pick<SavedPerson, "id" | "owner_id" | "name" | "email" | "age">;
                Update: Partial<Pick<SavedPerson, "id" | "owner_id" | "name" | "email" | "age">>;
                Relationships: [];
            };
        };
        Views: { [_ in never]: never };
        Functions: { [_ in never]: never };
        Enums: { [_ in never]: never };
        CompositeTypes: { [_ in never]: never };
    };
};

export const supabase = configError
    ? null
    : createClient<Database>(supabaseUrl!, supabaseKey!, {
          auth: {
              storageKey: "people-manager-auth",
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: false,
          },
      });
