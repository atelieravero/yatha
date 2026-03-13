import { signIn } from "@/auth";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  // If the user is already logged in, seamlessly redirect them to the app
  const session = await auth();
  if (session) {
    redirect("/");
  }

  // Fetch the license info from environment variables
  const licenseeName = process.env.LICENSEE_NAME || "Open Source Edition";

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-zinc-900 flex flex-col justify-center items-center p-4 selection:bg-zinc-200">
      <div className="max-w-sm w-full flex flex-col items-center text-center">
        
        {/* Brand & Motto */}
        <div className="space-y-4 mb-12">
          <h1 className="text-5xl md:text-6xl font-serif tracking-tight text-zinc-800">
            Yathā
          </h1>
          <p className="text-base text-zinc-500 font-light tracking-wide">
            Navigate your world as it is.
          </p>
        </div>

        {/* Auth Button */}
        <div className="w-full">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 bg-white border border-zinc-200/80 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition-all px-6 py-3.5 rounded-2xl shadow-sm font-medium focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:ring-offset-2"
            >
              {/* Google G Logo SVG */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </button>
          </form>
        </div>

        {/* Footer / License */}
        <div className="mt-24 text-xs text-zinc-400 font-light tracking-wide">
          <p>Licensed Archive: <span className="font-medium text-zinc-500">{licenseeName}</span></p>
        </div>

      </div>
    </div>
  );
}