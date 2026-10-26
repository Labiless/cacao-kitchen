import { describeSteps, type MenuItemId } from "@cacao/shared";

interface Props {
  dish: MenuItemId;
}

/** A recipe's steps in order, from taking the ingredients to the last appliance. */
export function RecipeSteps({ dish }: Props) {
  return (
    <ol className="recipe-steps">
      {describeSteps(dish).map(({ emoji, where, what }, i) => (
        <li key={i}>
          <span className="step-emoji">{emoji}</span>
          <span>
            <strong>{where}</strong> · {what}
          </span>
        </li>
      ))}
    </ol>
  );
}
