# import subprocess

# exts = ('js')

# def upgrade(file_manager):
#     nb = len([1 for file in file_manager if file.path.name.rsplit('.', 1)[1] in exts])
#     i = 0
#     file_manager.print_progress(0, nb)


#     for file in file_manager:
#         if file.path.name.rsplit('.', 1)[1] in exts:


#             process = subprocess.Popen(['addons/web/tooling/script.js', file.path._str],
#                                 stdout=subprocess.PIPE, 
#                                 stderr=subprocess.PIPE,
#                                 universal_newlines=True)

#             stdout, stderr = process.communicate()

#             content = file.content

#             file.content = content

#             i += 1
#             file_manager.print_progress(i, nb)
