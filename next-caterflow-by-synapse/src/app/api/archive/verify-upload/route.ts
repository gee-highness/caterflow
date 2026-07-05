import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  validateArchiveUploadFileContent,
  validateArchiveUploadFileStream,
  validateArchiveUploadFileStreamEvents,
} from "@/lib/archiveUploadValidation";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    const url = new URL(request.url);
    const useStream = url.searchParams.get("stream") === "true";
    const insertMissing = url.searchParams.get("insert") === "true";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: "Missing uploaded file. Use form field 'file'." },
          { status: 400 },
        );
      }

      if (useStream) {
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const encoder = new TextEncoder();
            try {
              for await (const event of validateArchiveUploadFileStreamEvents(
                file.stream(),
                { insertMissing: insertMissing },
              )) {
                controller.enqueue(
                  encoder.encode(`${JSON.stringify(event)}\n`),
                );
              }
            } catch (error: any) {
              controller.enqueue(
                encoder.encode(
                  `${JSON.stringify({
                    type: "error",
                    error: error?.message || "Unknown error",
                  })}\n`,
                ),
              );
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson",
          },
        });
      }

      const validation = await validateArchiveUploadFileStream(file.stream());
      return NextResponse.json(validation);
    }

    const bodyStream = request.body;
    if (!bodyStream) {
      return NextResponse.json(
        { error: "Missing request body." },
        { status: 400 },
      );
    }

    if (useStream) {
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const event of validateArchiveUploadFileStreamEvents(
              bodyStream,
              { insertMissing: insertMissing },
            )) {
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            }
          } catch (error: any) {
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({
                  type: "error",
                  error: error?.message || "Unknown error",
                })}\n`,
              ),
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
        },
      });
    }

    const validation = await validateArchiveUploadFileStream(bodyStream);
    return NextResponse.json(validation);
    if (fileContent === null) {
      return NextResponse.json(
        { error: "Uploaded file content is empty." },
        { status: 400 },
      );
    }

    const validation = await validateArchiveUploadFileContent(fileContent);
    return NextResponse.json(validation);
  } catch (error: any) {
    console.error("Failed to validate archive upload file:", error);
    return NextResponse.json(
      {
        error: "Failed to validate archive file",
        message: error?.message,
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "Archive upload verification endpoint",
    method: "POST",
    description:
      "Upload a NDJSON file with archive docs and verify each line exists in Mongo archive collections.",
  });
}
