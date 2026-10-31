type Email = { subject: string; body: string };

export function inviteEmail(name: string, jobTitle: string, orgName: string): Email {
  const first = name.split(" ")[0];
  return {
    subject: `Next step for your ${jobTitle} application at ${orgName}`,
    body: [
      `Hi ${first},`,
      "",
      `Thank you for applying for the ${jobTitle} role at ${orgName}. We liked your answers and would like to talk with you.`,
      "",
      "Someone from our team will contact you within 2 working days to arrange a short conversation. You can reply to this email if you have any questions.",
      "",
      `— The ${orgName} hiring team`,
    ].join("\n"),
  };
}

export function rejectionEmail(name: string, jobTitle: string, orgName: string): Email {
  const first = name.split(" ")[0];
  return {
    subject: `Your application for ${jobTitle} at ${orgName}`,
    body: [
      `Hi ${first},`,
      "",
      `Thank you for taking the time to apply for the ${jobTitle} role at ${orgName}. We read every application carefully.`,
      "",
      "We won't be moving forward with your application for this role. This decision was made by a person on our team, and it isn't a judgement of your worth or your potential.",
      "",
      "We'd be glad to see you apply again for future openings.",
      "",
      `Wishing you all the best,\nThe ${orgName} hiring team`,
    ].join("\n"),
  };
}

export function bookingLinkEmail(name: string, jobTitle: string, orgName: string, url: string | null): Email {
  const first = name.split(" ")[0];
  return {
    subject: url ? `Choose a time for your ${jobTitle} interview` : `Your ${jobTitle} interview at ${orgName}`,
    body: [
      `Hi ${first},`,
      "",
      `We'd like to meet you for the ${jobTitle} role at ${orgName}.`,
      "",
      ...(url
        ? ["Please choose a time that suits you here:", url, "", "You can change or cancel it from the same link up to 12 hours before."]
        : ["Someone from our team will call you within 2 working days to fix a time that suits you."]),
      "",
      `— The ${orgName} hiring team`,
    ].join("\n"),
  };
}

export function interviewConfirmedEmail(name: string, jobTitle: string, orgName: string, when: string, mode: string, location: string): Email {
  const first = name.split(" ")[0];
  return {
    subject: `Interview confirmed: ${when}`,
    body: [
      `Hi ${first},`,
      "",
      `Your interview for the ${jobTitle} role at ${orgName} is booked.`,
      "",
      `When: ${when} (India time)`,
      `How: ${mode}`,
      `Where: ${location}`,
      "",
      "If you need to change the time, use the link from our earlier email, or reply to this one.",
      "",
      `— The ${orgName} hiring team`,
    ].join("\n"),
  };
}

export function interviewCancelledEmail(name: string, jobTitle: string, orgName: string): Email {
  const first = name.split(" ")[0];
  return {
    subject: `Your ${jobTitle} interview time was cancelled`,
    body: [
      `Hi ${first},`,
      "",
      `Your interview time for the ${jobTitle} role at ${orgName} has been cancelled. Your application is still open.`,
      "",
      "If you have a booking link you can choose a new time from it; otherwise someone from our team will be in touch.",
      "",
      `— The ${orgName} hiring team`,
    ].join("\n"),
  };
}
