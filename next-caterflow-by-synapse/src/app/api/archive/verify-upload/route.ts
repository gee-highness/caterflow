import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { validateArchiveUploadFileContent } from "@/lib/archiveUploadValidation";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let fileContent: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: "Missing uploaded file. Use form field 'file'." },
          { status: 400 },
        );
      }
      fileContent = await file.text();
    } else {
      const body = await request.json();
      if (!body?.fileContent || typeof body.fileContent !== "string") {
        return NextResponse.json(
          { error: "Missing fileContent in request body." },
          { status: 400 },
        );
      }
      fileContent = body.fileContent;
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
