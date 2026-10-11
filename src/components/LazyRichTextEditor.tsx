import { useEffect, useState } from "react";

type EditorComponent = React.ComponentType<any>;
let editorPromise: Promise<EditorComponent> | null = null;

function loadEditor(): Promise<EditorComponent> {
  if (!editorPromise) {
    editorPromise = Promise.all([
      import("react-quill-new"),
      import("react-quill-new/dist/quill.snow.css"),
    ]).then(([module]) => module.default as EditorComponent).catch((error) => {
      editorPromise = null;
      throw error;
    });
  }
  return editorPromise;
}

/** Keeps the commercial pages interactive while the rich-text editor downloads. */
export default function LazyRichTextEditor(props: any) {
  const [Editor, setEditor] = useState<EditorComponent | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    loadEditor().then((component) => {
      if (active) setEditor(() => component);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, []);

  if (Editor) return <Editor {...props} />;
  return (
    <div className="flex min-h-[200px] items-center justify-center px-4 text-xs text-slate-500" aria-live="polite">
      {failed ? "Não foi possível carregar o editor. Recarregue a página." : "Carregando editor de texto…"}
    </div>
  );
}
