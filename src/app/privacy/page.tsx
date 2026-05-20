import Link from "next/link";

import { Icon } from "@/app/components/server";

import { ArrowBackIcon } from "@/app/assets/icons";

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="flex items-center h-20 px-4 sm:px-6 max-w-2xl mx-auto w-full">
        <Link
          href="/"
          className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity w-fit"
        >
          <Icon src={ArrowBackIcon} className="size-5" />
          <span className="text-sm">Back</span>
        </Link>
      </header>

      <main className="flex flex-col flex-1 gap-6 px-4 py-6 sm:px-6 max-w-2xl mx-auto w-full">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight">Privacy Policy</h2>
          <p className="text-sm opacity-60">Last updated: May 2026</p>
        </div>
        <p className="text-sm opacity-80 text-justify">
          docsnap is a personal project built and maintained by one person (that
          being me of course). I originally built it for a family member who
          needed a reliable document scanner, and have been using it myself ever
          since. My motivation came from years of using other scanning apps that
          worked well enough but came with intrusive ads so I wanted something
          clean, fast, and private that I could trust with sensitive documents.
          docsnap works entirely in the browser and NEVER sends your documents
          anywhere.
        </p>
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">On-device processing</h3>
          <p className="text-sm opacity-80 text-justify">
            docsnap processes all images entirely on your device. Your documents
            are never uploaded to any server, shared with third parties, or
            stored anywhere outside your browser session.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">Session memory</h3>
          <p className="text-sm opacity-80 text-justify">
            Images are held in memory only for the duration of your session.
            When you close or refresh the app, all images and processed data are
            permanently removed. Nothing is written to local storage, cookies,
            or your device's file system.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">Data ethics</h3>
          <p className="text-sm opacity-80 text-justify">
            The document detection model was trained on synthetic data only,
            including the publicly available{" "}
            <a
              href="https://github.com/cvlab-stonybrook/doc3D-dataset"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Doc3D dataset
            </a>{" "}
            and documents I own personally. No real user documents were used in
            training. The model has never seen your documents, not during
            training nor during use.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">Third-party services</h3>
          <p className="text-sm opacity-80 text-justify">
            docsnap is hosted on{" "}
            <a
              href="https://vercel.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Vercel
            </a>
            . Vercel may collect standard web server logs (IP addresses, request
            timestamps) as part of their hosting infrastructure. See{" "}
            <a
              href="https://vercel.com/legal/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Vercel's Privacy Policy
            </a>{" "}
            for more details. The document detection model runs entirely on your
            device through WebAssembly. The model weights are loaded once from
            Vercel's CDN and are not used to collect or infer any information
            about your documents.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold">Contact</h3>
          <p className="text-sm opacity-80 text-justify">
            If you have a question, found a bug (there's probably a lot of
            them), or want to share feedback? I'd love to hear from you at{" "}
            <a
              href="mailto:phantanhoancuong@gmail.com"
              className="underline underline-offset-2"
            >
              phantanhoancuong@gmail.com
            </a>
            .
          </p>
        </div>
      </main>

      <footer className="text-xs text-gray-400 text-center pb-4">
        app version: {process.env.NEXT_PUBLIC_VERSION}
      </footer>
    </div>
  );
}
