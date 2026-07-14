export const DEMO_TRANSCRIPT_TICK_MS = 9_000;

const demoDialogueTurns = [
  "Profesor: Buenos dias, clase. Hoy vamos a conocer las partes de una noticia.",
  "Profesor: Una noticia informa sobre un hecho real y reciente de interes para la comunidad.",
  "Axel: Profe, el titular es el texto grande que presenta la noticia.",
  "Profesor: Exactamente, Axel. El titular anuncia el hecho principal y llama la atencion del lector.",
  "Profesor: Debajo del titular suele aparecer la entradilla, que resume lo mas importante.",
  "Valeria: Entonces la entradilla nos ayuda a saber que paso sin leer todo el texto.",
  "Profesor: Muy bien. Luego encontramos el cuerpo, donde aparecen los detalles del hecho.",
  "Profesor: En el cuerpo debemos buscar que ocurrio, donde ocurrio y cuando ocurrio.",
  "Axel: Tambien podemos preguntar quienes participaron y por que sucedio.",
  "Profesor: Correcto. Esas preguntas nos ayudan a comprender la informacion.",
  "Profesor: La fuente indica de donde viene la noticia o quien proporciona los datos.",
  "Valeria: Una entrevista, un periodico o una institucion pueden ser fuentes.",
  "Profesor: Buena observacion. Una fuente confiable permite verificar la informacion.",
  "Profesor: Hoy clasificaremos cada parte para reconocer la estructura de una noticia.",
  "Axel: Si presenta el hecho en pocas palabras, probablemente es el titular.",
  "Profesor: Exactamente. Si resume los datos principales, es la entradilla.",
  "Profesor: Para cerrar, lean una noticia breve y marquen titular, entradilla, cuerpo y fuente.",
  "Valeria: Mi noticia tiene un titular sobre una feria del libro en la escuela.",
  "Profesor: En la entradilla encontramos cuando sera la feria y quienes participaran.",
  "Axel: En el cuerpo aparecen los detalles de las actividades y la fuente es la escuela.",
  "Profesor: Excelente. Hoy identificamos las partes de una noticia para comprender mejor lo que leemos.",
];

const TURNS_PER_CHUNK = 2;

export const demoTranscriptChunks = chunkDialogueTurns(demoDialogueTurns, TURNS_PER_CHUNK);

function chunkDialogueTurns(turns: string[], turnsPerChunk: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < turns.length; index += turnsPerChunk) {
    chunks.push(turns.slice(index, index + turnsPerChunk).join("\n"));
  }
  return chunks;
}
