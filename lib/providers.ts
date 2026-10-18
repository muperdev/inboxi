import type { ProviderId } from "@/lib/mail-types";

export type ProviderPreset = {
  id: ProviderId;
  label: string;
  description: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  help: string;
  helpHref: string;
};

export const providerPresets: readonly ProviderPreset[] = [
  {
    id: "icloud",
    label: "iCloud",
    description: "Apple ID, custom domains, and Hide My Email",
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    smtpSecure: false,
    help: "Use an app-specific password from appleid.apple.com. Custom-domain addresses on this Apple ID are aliases — add them below, they share this inbox.",
    helpHref: "https://appleid.apple.com",
  },
  {
    id: "gmail",
    label: "Gmail",
    description: "Google accounts and send-as aliases",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    help: "Turn on IMAP in Gmail settings. With 2-Step Verification, create an app password. Add send-as addresses as aliases.",
    helpHref: "https://myaccount.google.com/apppasswords",
  },
  {
    id: "imap",
    label: "IMAP",
    description: "Any other mailbox",
    imapHost: "",
    imapPort: 993,
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    help: "Hostnames come from your mail provider. Port 993 is usual for IMAP, and 587 for SMTP.",
    helpHref: "",
  },
];

export function presetFor(provider: ProviderId): ProviderPreset {
  const preset = providerPresets.find((item) => item.id === provider);
  return preset ?? providerPresets[0];
}
