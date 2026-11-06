from load import load_everything


def main():
    data = load_everything()

    for name, contents in data.items():
        print(f"{name}: {len(contents)}")


if __name__ == "__main__":
    main()
