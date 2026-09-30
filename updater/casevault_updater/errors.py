"""The problems the updater can meet. Each carries a plain message for the window."""


class UpdaterError(Exception):
    """Base class. str(e) is the message shown to the user."""


class NoInternet(UpdaterError):
    def __init__(self, detail: str = ""):
        super().__init__("Can't reach GitHub. Check the internet connection (or the proxy) and try again."
                         + (f" ({detail})" if detail else ""))


class RateLimited(UpdaterError):
    def __init__(self, reset_epoch: int = 0):
        self.reset_epoch = reset_epoch
        when = ""
        if reset_epoch:
            import time
            when = " after " + time.strftime("%H:%M", time.localtime(reset_epoch))
        super().__init__(f"GitHub's hourly limit for checks from this network is used up. Try again{when}.")


class NotFound(UpdaterError):
    def __init__(self, what: str):
        super().__init__(f"Not found on GitHub: {what}. Check the repository and branch in the updater settings.")


class ServerError(UpdaterError):
    def __init__(self, status: int):
        super().__init__(f"GitHub answered with an error ({status}). Try again in a few minutes.")


class BadResponse(UpdaterError):
    def __init__(self, what: str):
        super().__init__(f"GitHub sent something unexpected ({what}). Try again; nothing was changed.")
