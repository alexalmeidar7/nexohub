import { supabase } from "@/integrations/supabase/client";

export default async function uploadProgramImage(file: File, userId: string, type: 'capa' | 'selo'): Promise<string | null> {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${type}/${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from('programas')
      .upload(fileName, file);

    if (uploadError) {
      console.error('Error uploading program image:', uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('programas')
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (error) {
    console.error('Error in uploadProgramImage:', error);
    return null;
  }
}
