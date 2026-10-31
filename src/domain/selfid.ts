/** Optional, voluntary self-description used only in aggregate by the fairness monitor. */
export const SELF_ID = {
  gender: { label: "Gender", options: { woman: "Woman", man: "Man", non_binary: "Non-binary" } },
  age: { label: "Age", options: { "18_24": "18–24", "25_34": "25–34", "35_44": "35–44", "45_54": "45–54", "55_plus": "55 or older" } },
  disability: { label: "Disability", options: { yes: "Yes, I have a disability", no: "No" } },
} as const;

export type SelfIdKey = keyof typeof SELF_ID;
export const SELF_ID_KEYS = Object.keys(SELF_ID) as SelfIdKey[];
export type SelfIdAnswers = { [K in SelfIdKey]?: keyof (typeof SELF_ID)[K]["options"] };

export function optionKeys<K extends SelfIdKey>(key: K): [string, ...string[]] {
  return Object.keys(SELF_ID[key].options) as [string, ...string[]];
}
