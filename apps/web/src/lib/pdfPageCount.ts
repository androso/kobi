import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function countPdfPages(file: File): Promise<number> {
  const document = await getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;

  try {
    return document.numPages;
  } finally {
    await document.destroy();
  }
}