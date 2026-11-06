import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { noticiasComCampoFixo } from "../_shared/roteiroNoticias.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = new Date().toISOString()
    
    // Busca roteiros agendados para agora ou passado que ainda não foram enviados
    const { data: roteiros, error: fetchError } = await supabaseAdmin
      .from('roteiros')
      .select('*')
      .lte('agendado_para_envio', now)
      .eq('enviado_agendamento', false)

    if (fetchError) throw fetchError

    console.log(`Found ${roteiros?.length ?? 0} scheduled roteiros to process`)

    for (const roteiro of (roteiros || [])) {
      try {
        let participantsData = {}
        try {
          participantsData = typeof roteiro.participantes === 'string' 
            ? JSON.parse(roteiro.participantes) 
            : (roteiro.participantes || {})
        } catch (e) { console.error("JSON Parse error", e) }

        const xmlContent = generateXml(roteiro, participantsData)
        const filePath = roteiro.subtitulo?.startsWith("express_xml::")
          ? roteiro.subtitulo.replace("express_xml::", "").split('/empresa-assets/')[1]
          : `express/${roteiro.user_id}/express_${roteiro.id}.xml`

        const { error: uploadError } = await supabaseAdmin.storage
          .from('empresa-assets')
          .upload(filePath, xmlContent, { upsert: true, contentType: 'application/xml' })

        if (uploadError) throw uploadError

        const { data: urlData } = supabaseAdmin.storage
          .from('empresa-assets')
          .getPublicUrl(filePath)

        await supabaseAdmin.from('roteiros').update({
          enviado_agendamento: true,
          xml_pushed_at: now,
          subtitulo: `express_xml::${urlData.publicUrl}`
        }).eq('id', roteiro.id)

        console.log(`Successfully processed roteiro ${roteiro.id}`)
      } catch (err) {
        console.error(`Error processing roteiro ${roteiro.id}:`, err)
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: roteiros?.length ?? 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

function escXml(s: string) {
  if (!s) return ""
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function generateXml(roteiro: any, data: any): string {
  const pList = data.participantes || []
  const blocosList = data.blocos || []
  const escaladaItems = data.escaladaList || []
  const isPodcast = !!data.podcastData

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<programaExpress>\n`
  xml += `  <programa>${escXml(roteiro.programa_nome || "")}</programa>\n`
  xml += `  <estudio>${escXml(roteiro.estudio || "")}</estudio>\n`
  xml += `  <data>${roteiro.data_programa || new Date().toISOString().split("T")[0]}</data>\n`

  if (pList.length > 0) {
    xml += `  <participantes>\n`
    pList.forEach((p: any) => {
      xml += `    <item>\n      <nome>${escXml(p.nome)}</nome>\n      <cargo>${escXml(p.cargo)}</cargo>\n      <instagram>${escXml(p.instagram)}</instagram>\n    </item>\n`
    })
    xml += `  </participantes>\n`
  }

  if (isPodcast) {
    const podcast = data.podcastData
    xml += `  <roteiro>\n`
    xml += `    <tituloTarja>${escXml(podcast.tituloTarja)}</tituloTarja>\n`
    xml += `    <introducao>${escXml(podcast.introducao)}</introducao>\n`
    xml += `    <perguntas>\n`
    podcast.perguntas.filter((p: any) => p?.trim()).forEach((p: any, i: number) => { 
      xml += `      <pergunta ordem="${i + 1}">${escXml(p)}</pergunta>\n` 
    })
    xml += `    </perguntas>\n`
    xml += `    <concluindo>${escXml(podcast.concluindo)}</concluindo>\n`
    xml += `  </roteiro>\n`
  } else {
    if (escaladaItems.length > 0) {
      xml += `  <escalada>\n`
      escaladaItems.forEach((e: any, i: number) => {
        xml += `    <item ordem="${i + 1}">\n      <titulo>${escXml(e.titulo)}</titulo>\n      <imagem>${escXml(e.imagemUrl)}</imagem>\n    </item>\n`
      })
      xml += `  </escalada>\n`
    }
    blocosList.forEach((b: any, bi: number) => {
      xml += `  <bloco numero="${bi + 1}">\n`;
      noticiasComCampoFixo(b.noticias || [], data.campoFixo, bi === 0).forEach((n: any, ni: number) => {
        if (!n?.titulo) return
        xml += `    <noticia ordem="${ni + 1}">\n      <titulo>${escXml(n.titulo)}</titulo>\n      <imagem>${escXml(n.imagemUrl)}</imagem>\n      <resumo>${escXml(n.resumo || "")}</resumo>\n      <texto_materia>${escXml(n.texto_materia || "")}</texto_materia>\n      <escalada>${n.escalada}</escalada>\n    </noticia>\n`
      })
      xml += `  </bloco>\n`
    })
  }
  xml += `</programaExpress>`
  return xml
}
