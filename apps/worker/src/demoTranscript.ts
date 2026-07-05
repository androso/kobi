export const DEMO_TRANSCRIPT_TICK_MS = 9_000;

const demoDialogueTurns = [
  "Profesor: Buenos dias, clase. Hoy vamos a conocer los triangulos y los cuadrilateros.",
  "Profesor: Empecemos con algo sencillo: una figura plana esta formada por segmentos.",
  "Axel: Profe, entonces los lados son esos segmentos que rodean la figura.",
  "Profesor: Exactamente, Axel. Cada segmento que forma el borde es un lado.",
  "Profesor: Cuando dos lados se encuentran, forman un vertice.",
  "Valeria: En un triangulo hay tres vertices, porque se juntan tres esquinas.",
  "Profesor: Muy bien. Un triangulo tiene tres lados, tres vertices y tres angulos.",
  "Profesor: Ahora observen este dibujo. Si contamos cuatro lados, ya no es triangulo.",
  "Axel: Es un cuadrilatero, porque tiene cuatro lados.",
  "Profesor: Correcto. Los cuadrilateros tienen cuatro lados, cuatro vertices y cuatro angulos.",
  "Profesor: Un cuadrado, un rectangulo y un rombo son ejemplos de cuadrilateros.",
  "Valeria: El rectangulo tiene lados opuestos iguales, pero no todos son iguales.",
  "Profesor: Buena observacion. Lo importante hoy es clasificar por lados y vertices.",
  "Profesor: Si una figura tiene tres lados, decimos triangulo. Si tiene cuatro, decimos cuadrilatero.",
  "Axel: Entonces primero contamos los lados, despues revisamos vertices y angulos.",
  "Profesor: Exactamente. Esa estrategia nos ayuda a no confundir las figuras.",
  "Profesor: Para cerrar, dibujen una figura con tres segmentos y marquen sus vertices.",
  "Valeria: Mi dibujo tiene tres lados y tres vertices, entonces es un triangulo.",
  "Profesor: Ahora dibujen una figura con cuatro segmentos y marquen sus vertices y angulos.",
  "Axel: La mia tiene cuatro lados, cuatro vertices y cuatro angulos. Es un cuadrilatero.",
  "Profesor: Excelente. Hoy identificamos lados, vertices y angulos para clasificar triangulos y cuadrilateros.",
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
